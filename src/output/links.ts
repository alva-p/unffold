const TTY = process.stdout.isTTY ?? false

export function hyperlink(text: string, url: string): string {
  if (!TTY) return text
  return `\x1b]8;;${url}\x1b\\${text}\x1b]8;;\x1b\\`
}

export function addressLink(display: string, fullAddress: string, explorerBase: string): string {
  return hyperlink(display, explorerBase + fullAddress)
}

export function txLink(display: string, fullHash: string, explorerBase: string): string {
  const txBase = explorerBase.replace('/address/', '/tx/')
  return hyperlink(display, txBase + fullHash)
}
