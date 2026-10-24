export interface Channel {
  id: string;
  name: string;
  /** Region from the feed prefix ("São Paulo/SP"), when present. */
  location?: string;
}
