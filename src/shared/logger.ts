/**
 * Logger estruturado mínimo: mensagem + campos, uma linha JSON por evento.
 * Código novo recebe um Logger por injeção em vez de chamar console direto,
 * o que permite silenciar em testes e trocar o destino depois.
 */
export type LogLevel = "debug" | "info" | "warn" | "error";
export type LogFields = Record<string, unknown>;

export interface LogRecord {
  level: LogLevel;
  scope: string;
  msg: string;
  time: string;
  fields?: LogFields;
}

export interface Logger {
  debug(msg: string, fields?: LogFields): void;
  info(msg: string, fields?: LogFields): void;
  warn(msg: string, fields?: LogFields): void;
  error(msg: string, fields?: LogFields): void;
  child(scope: string): Logger;
}

export type LogSink = (record: LogRecord) => void;

const LEVEL_ORDER: Record<LogLevel, number> = { debug: 10, info: 20, warn: 30, error: 40 };

export const consoleSink: LogSink = (record) => {
  const line = JSON.stringify(record, (_key, value: unknown) =>
    value instanceof Error ? { name: value.name, message: value.message, stack: value.stack } : value
  );
  if (record.level === "error" || record.level === "warn") console.error(line);
  else console.log(line);
};

export function createLogger(options: { scope?: string; minLevel?: LogLevel; sink?: LogSink } = {}): Logger {
  const scope = options.scope ?? "atlas";
  const minLevel = options.minLevel ?? "info";
  const sink = options.sink ?? consoleSink;

  const log = (level: LogLevel) => (msg: string, fields?: LogFields) => {
    if (LEVEL_ORDER[level] < LEVEL_ORDER[minLevel]) return;
    sink({ level, scope, msg, time: new Date().toISOString(), ...(fields ? { fields } : {}) });
  };

  return {
    debug: log("debug"),
    info: log("info"),
    warn: log("warn"),
    error: log("error"),
    child: (child) => createLogger({ scope: `${scope}:${child}`, minLevel, sink }),
  };
}

/** Descarta tudo — padrão em testes. */
export const silentLogger: Logger = createLogger({ sink: () => {} });
