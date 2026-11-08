// AI apps introduce themselves with technical names ("claude-ai", "local-agent-mode-well-good-mail"). People see
// the plain name instead.

const KNOWN: [RegExp, string][] = [
  [/claude[-_ ]?code|local[-_ ]agent[-_ ]mode/i, 'Claude Code'],
  [/claude/i, 'Claude Desktop'],
  [/codex|chatgpt|openai/i, 'ChatGPT'],
  [/gemini/i, 'Gemini'],
  [/cursor/i, 'Cursor'],
  [/copilot|vscode|visual studio code/i, 'VS Code'],
  [/lm[-_ ]?studio/i, 'LM Studio'],
];

/** "claude-ai" becomes "Claude Desktop"; an unknown "my-helper_app" becomes "My helper app"; nothing becomes "An AI app". */
export function appName(raw?: string): string {
  const s = (raw || '').trim();
  if (!s) return 'An AI app';
  for (const [re, name] of KNOWN) if (re.test(s)) return name;
  const words = s.replace(/[-_]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 40);
  return words.charAt(0).toUpperCase() + words.slice(1);
}
