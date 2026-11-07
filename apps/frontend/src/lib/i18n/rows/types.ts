export type Msg = string | { one?: string; other: string };

export type Row = readonly [en: Msg, fr: Msg, es: Msg, de: Msg];
