export interface Channel {
  id: string;
  name: string;
  /** Região vinda do prefixo do feed ("São Paulo/SP"), quando existir. */
  location?: string;
}
