export const DEFAULT_BASE_URL = "http://192.168.100.123:11434";
export const DEFAULT_AUTOCOMPLETE_MODEL = "qwen2.5-coder:1.5b";
export const DEFAULT_CHAT_MODEL = "qwen3.6:27b";

export const MAX_CONTEXT_TOKENS = 12000;
export const RESERVED_TOKENS = 3000;
export const HISTORY_TOKEN_BUDGET = MAX_CONTEXT_TOKENS - RESERVED_TOKENS;

export const OLLAMA_API_ENDPOINT = "/api/chat";