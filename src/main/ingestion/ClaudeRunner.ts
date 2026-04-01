import { spawn } from 'child_process'
import type { AppSettings, IngestionOperation } from '../registry/SettingsManager'

export interface ClaudeRunnerResult {
  success: boolean
  data?: unknown
  rawOutput?: string
  error?: string
}

function ts(): string {
  return new Date().toTimeString().slice(0, 12) // HH:MM:SS.mmm
}

/**
 * Runs a prompt against the Claude Code CLI and returns parsed JSON.
 * Uses child_process.spawn — never the Anthropic API.
 */
export function runClaudePrompt(
  claudeBin: string,
  prompt: string,
  timeoutMs = 90_000,
  maxRetries = 1,
  model?: string,
): Promise<ClaudeRunnerResult> {
  return attemptRun(claudeBin, prompt, timeoutMs, 0, maxRetries, model)
}

async function attemptRun(
  claudeBin: string,
  prompt: string,
  timeoutMs: number,
  attempt: number,
  maxRetries: number,
  model?: string,
): Promise<ClaudeRunnerResult> {
  const result = await spawnOnce(claudeBin, prompt, timeoutMs, model)

  if (result.success) return result

  if (attempt < maxRetries) {
    // Exponential backoff with jitter: 2^attempt * 1s ± 50–100%, capped at 30s
    const base = Math.pow(2, attempt) * 1000
    const delay = Math.min(base * (0.5 + Math.random() * 0.5), 30_000)
    console.log(`[ClaudeRunner] ${ts()} retry ${attempt + 1}/${maxRetries} em ${Math.round(delay)}ms`)
    await new Promise((r) => setTimeout(r, delay))
    return attemptRun(claudeBin, prompt, timeoutMs, attempt + 1, maxRetries, model)
  }

  return result
}

function spawnOnce(
  claudeBin: string,
  prompt: string,
  timeoutMs: number,
  model?: string,
): Promise<ClaudeRunnerResult> {
  return new Promise((resolve) => {
    let stdout = ''
    let stderr = ''
    let settled = false
    const spawnedAt = Date.now()

    const args = [
      '-p', prompt,
      '--tools', '',               // sem ferramentas — geração de JSON puro
      '--no-session-persistence',  // não grava sessão em disco
      ...(model ? ['--model', model] : []),
    ]

    console.log(`[ClaudeRunner] ${ts()} spawn: ${claudeBin} -p "<prompt>" (${Buffer.byteLength(prompt, 'utf8')} bytes${model ? ` model=${model}` : ''})`)

    const proc = spawn(claudeBin, args, {
      env: { ...process.env },
      stdio: ['ignore', 'pipe', 'pipe'], // fecha stdin explicitamente
    })

    const timer = setTimeout(() => {
      if (settled) return
      settled = true
      proc.kill('SIGTERM')
      // Se o processo ignorar SIGTERM, força encerramento após 5s
      setTimeout(() => {
        try { proc.kill('SIGKILL') } catch { /* processo já encerrado */ }
      }, 5_000)
      resolve({ success: false, error: `Timeout após ${timeoutMs / 1000}s` })
    }, timeoutMs)

    proc.stdout.on('data', (chunk: Buffer) => { stdout += chunk.toString() })
    proc.stderr.on('data', (chunk: Buffer) => { stderr += chunk.toString() })

    proc.on('close', (code) => {
      const elapsed = ((Date.now() - spawnedAt) / 1000).toFixed(1)
      clearTimeout(timer)
      if (settled) {
        console.log(`[ClaudeRunner] ${ts()} close ignored (already settled): code=${code} elapsed=${elapsed}s`)
        return
      }
      settled = true

      console.log(`[ClaudeRunner] ${ts()} close code=${code} stdout=${stdout.length}chars elapsed=${elapsed}s stderr=${stderr.slice(0, 100)}`)

      if (code !== 0) {
        resolve({
          success: false,
          error: stderr.trim() || `Processo encerrou com código ${code}`,
          rawOutput: stdout,
        })
        return
      }

      resolve(parseOutput(stdout))
    })

    proc.on('error', (err) => {
      const elapsed = ((Date.now() - spawnedAt) / 1000).toFixed(1)
      clearTimeout(timer)
      if (settled) return
      settled = true
      console.error(`[ClaudeRunner] ${ts()} spawn error: ${err.message} elapsed=${elapsed}s`)
      resolve({ success: false, error: err.message })
    })
  })
}

/**
 * Runs a prompt against the OpenRouter API and returns parsed JSON.
 * Falls back to returning a failure result on HTTP or network errors.
 */
export async function runOpenRouterPrompt(
  apiKey: string,
  model: string,
  prompt: string,
  timeoutMs = 15_000,
  systemPrompt?: string,
): Promise<ClaudeRunnerResult> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  const startMs = Date.now()
  const bytes = prompt.length

  console.log(`[OpenRouter] ${ts()} model=${model} (${bytes} bytes)`)

  try {
    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'pulse-cockpit',
      },
      body: JSON.stringify({
        model,
        messages: [
          ...(systemPrompt ? [{ role: 'system', content: systemPrompt }] : []),
          { role: 'user', content: prompt },
        ],
        temperature: 0,
      }),
    })

    const elapsed = ((Date.now() - startMs) / 1000).toFixed(2)
    console.log(`[OpenRouter] ${ts()} status=${response.status} elapsed=${elapsed}s`)

    if (!response.ok) {
      let errorMessage: string
      try {
        const body = await response.json() as { error?: { message?: string } }
        errorMessage = body.error?.message ?? String(response.status)
      } catch {
        errorMessage = String(response.status)
      }
      return { success: false, error: `OpenRouter HTTP ${response.status}: ${errorMessage}` }
    }

    const body = await response.json() as { choices?: Array<{ message?: { content?: string } }> }
    const content = body.choices?.[0]?.message?.content ?? ''
    return parseOutput(content)
  } catch (err: unknown) {
    const elapsed = ((Date.now() - startMs) / 1000).toFixed(2)
    const message = err instanceof Error ? err.message : String(err)
    console.log(`[OpenRouter] ${ts()} error elapsed=${elapsed}s msg=${message}`)
    return { success: false, error: message }
  } finally {
    clearTimeout(timer)
  }
}

// ── Provider resolution ───────────────────────────────────────────────────────

interface ResolvedProvider {
  provider: 'claude-cli' | 'openrouter'
  /** Model para claude-cli (passed via --model). undefined = usa o default do CLI. */
  claudeModel: string | undefined
  openRouterModel: string
  openRouterApiKey: string | undefined
  fallbackToClaude: boolean
}

// Operações elegíveis no modo legado useHybridModel
const LEGACY_HYBRID_OPS: IngestionOperation[] = ['ingestionPass1', 'ceremonySinals']

export function resolveProvider(operation: IngestionOperation, settings: AppSettings): ResolvedProvider {
  const defaultOpenRouterModel = settings.openRouterModel ?? 'google/gemma-3-27b-it'
  // claudeDefaultModel aplica a todas as operações; ingestionModel é legado para ingestionDeep1on1
  const defaultClaudeModel = settings.claudeDefaultModel
    ?? (operation === 'ingestionDeep1on1' ? (settings.ingestionModel ?? 'haiku') : 'haiku')

  // 1. Override por operação
  const override = settings.providers?.[operation]
  if (override) {
    const isOpenRouter = override.provider === 'openrouter'
    return {
      provider: override.provider,
      claudeModel: isOpenRouter ? defaultClaudeModel : (override.model ?? defaultClaudeModel),
      openRouterModel: isOpenRouter ? (override.model ?? defaultOpenRouterModel) : defaultOpenRouterModel,
      openRouterApiKey: settings.openRouterApiKey,
      fallbackToClaude: override.fallbackToClaude ?? isOpenRouter,
    }
  }

  // 2. Provider padrão global
  if (settings.defaultProvider) {
    const isOpenRouter = settings.defaultProvider === 'openrouter'
    return {
      provider: settings.defaultProvider,
      claudeModel: isOpenRouter ? defaultClaudeModel : defaultClaudeModel,
      openRouterModel: defaultOpenRouterModel,
      openRouterApiKey: settings.openRouterApiKey,
      fallbackToClaude: isOpenRouter,
    }
  }

  // 3. Legacy: useHybridModel (backward compat — só para ops elegíveis)
  const hybridActive = !!(settings.useHybridModel && settings.openRouterApiKey)
  if (hybridActive && LEGACY_HYBRID_OPS.includes(operation)) {
    return {
      provider: 'openrouter',
      claudeModel: defaultClaudeModel,
      openRouterModel: defaultOpenRouterModel,
      openRouterApiKey: settings.openRouterApiKey,
      fallbackToClaude: true,
    }
  }

  // 4. Default: claude-cli
  return {
    provider: 'claude-cli',
    claudeModel: defaultClaudeModel,
    openRouterModel: defaultOpenRouterModel,
    openRouterApiKey: settings.openRouterApiKey,
    fallbackToClaude: false,
  }
}

/**
 * Executa um prompt usando o provider configurado para a operação.
 * Gerencia fallback automático para claude-cli se o provider principal falhar.
 */
export async function runWithProvider(
  operation: IngestionOperation,
  settings: AppSettings,
  prompt: string,
  opts: {
    claudeBinPath: string
    claudeTimeoutMs?: number
    openRouterTimeoutMs?: number
    systemPrompt?: string
    validate?: (data: unknown) => { valid: boolean; missingFields: string[]; typeErrors: string[] }
  },
): Promise<ClaudeRunnerResult> {
  const resolved = resolveProvider(operation, settings)
  const claudeTimeout = opts.claudeTimeoutMs ?? 90_000
  const openRouterTimeout = opts.openRouterTimeoutMs ?? 15_000

  if (resolved.provider === 'openrouter') {
    if (!resolved.openRouterApiKey) {
      console.warn(`[runWithProvider] ${operation}: OpenRouter selecionado mas sem API key — usando Claude CLI`)
      return runClaudePrompt(opts.claudeBinPath, prompt, claudeTimeout, 1, resolved.claudeModel)
    }

    const result = await runOpenRouterPrompt(
      resolved.openRouterApiKey,
      resolved.openRouterModel,
      prompt,
      openRouterTimeout,
      opts.systemPrompt,
    )

    if (result.success && result.data) {
      if (opts.validate) {
        const check = opts.validate(result.data)
        if (!check.valid) {
          const details = [
            ...check.missingFields.map((f) => `campo ausente: ${f}`),
            ...check.typeErrors,
          ].join('; ')
          console.warn(`[runWithProvider] ${operation} OpenRouter schema inválido${resolved.fallbackToClaude ? ', fallback para Claude' : ''}: ${details}`)
          if (resolved.fallbackToClaude) {
            return runClaudePrompt(opts.claudeBinPath, prompt, claudeTimeout, 1, resolved.claudeModel)
          }
          return result
        }
      }
      return result
    }

    if (resolved.fallbackToClaude) {
      console.warn(`[runWithProvider] ${operation} OpenRouter falhou, fallback para Claude: ${result.error}`)
      return runClaudePrompt(opts.claudeBinPath, prompt, claudeTimeout, 1, resolved.claudeModel)
    }

    return result
  }

  // claude-cli
  return runClaudePrompt(opts.claudeBinPath, prompt, claudeTimeout, 1, resolved.claudeModel)
}

function parseOutput(raw: string): ClaudeRunnerResult {
  const text = raw.trim()

  // 1. Direct JSON parse
  try {
    const data = JSON.parse(text)
    return { success: true, data, rawOutput: text }
  } catch { /* try next */ }

  // 2. Extract JSON from markdown code fence ```json ... ```
  const fenceMatch = text.match(/```(?:json)?\s*\n([\s\S]+?)\n```/)
  if (fenceMatch) {
    try {
      const data = JSON.parse(fenceMatch[1].trim())
      return { success: true, data, rawOutput: text }
    } catch { /* fall through */ }
  }

  // 3. Find first { ... } block
  const braceMatch = text.match(/\{[\s\S]+\}/)
  if (braceMatch) {
    try {
      const data = JSON.parse(braceMatch[0])
      return { success: true, data, rawOutput: text }
    } catch { /* fall through */ }
  }

  return {
    success: false,
    error: 'Resposta não é JSON válido',
    rawOutput: text,
  }
}
