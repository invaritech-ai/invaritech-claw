const ESC = "\u001b";
const BEL = "\u0007";
const SGR_PATTERN = "\\x1b\\[[0-9;]*m";
const OSC8_PATTERN = "\\x1b\\]8;;.*?(?:\\x07|\\x1b\\\\)";
const ANSI_RE = new RegExp(`${SGR_PATTERN}|${OSC8_PATTERN}`, "g");
const SGR_START_RE = new RegExp(`^${SGR_PATTERN}`);
const OSC8_START_RE = new RegExp(`^${OSC8_PATTERN}`);

type UrlRange = {
  start: number;
  end: number;
  url: string;
};

export function wrapOsc8(url: string, text: string): string {
  return `${ESC}]8;;${url}${BEL}${text}${ESC}]8;;${BEL}`;
}

export function extractUrls(markdown: string): string[] {
  const urls = new Set<string>();
  const markdownLinkPattern =
    /\[(?:[^\]]*)\]\(\s*<?(https?:\/\/[^)\s>]+)>?(?:\s+["'][^"']*["'])?\s*\)/g;
  let match: RegExpExecArray | null;
  while ((match = markdownLinkPattern.exec(markdown)) !== null) {
    urls.add(match[1] ?? "");
  }

  const stripped = markdown.replace(
    /\[(?:[^\]]*)\]\(\s*<?https?:\/\/[^)\s>]+>?(?:\s+["'][^"']*["'])?\s*\)/g,
    "",
  );
  const bareUrlPattern = /https?:\/\/[^\s)\]>]+/g;
  while ((match = bareUrlPattern.exec(stripped)) !== null) {
    urls.add(match[0]);
  }

  return [...urls].filter((url) => url.length > 0);
}

function stripAnsi(input: string): string {
  return input.replace(ANSI_RE, "");
}

function findUrlRanges(
  visibleText: string,
  knownUrls: string[],
  pending: { url: string; consumed: number } | null,
): { ranges: UrlRange[]; pending: { url: string; consumed: number } | null } {
  const ranges: UrlRange[] = [];
  let nextPending: { url: string; consumed: number } | null = null;
  let searchFrom = 0;

  if (pending) {
    const remaining = pending.url.slice(pending.consumed);
    const trimmed = visibleText.trimStart();
    const leadingSpaces = visibleText.length - trimmed.length;
    let matchLength = 0;
    for (let index = 0; index < remaining.length && index < trimmed.length; index++) {
      if (remaining[index] !== trimmed[index]) {
        break;
      }
      matchLength++;
    }
    if (matchLength > 0) {
      ranges.push({
        start: leadingSpaces,
        end: leadingSpaces + matchLength,
        url: pending.url,
      });
      searchFrom = leadingSpaces + matchLength;
      if (pending.consumed + matchLength < pending.url.length) {
        nextPending = { url: pending.url, consumed: pending.consumed + matchLength };
      }
    }
  }

  const urlPattern = /https?:\/\/[^\s)\]>]+/g;
  urlPattern.lastIndex = searchFrom;
  let match: RegExpExecArray | null;
  while ((match = urlPattern.exec(visibleText)) !== null) {
    const fragment = match[0];
    const start = match.index;
    let resolvedUrl = fragment;
    let found = false;

    for (const knownUrl of knownUrls) {
      if (knownUrl === fragment) {
        resolvedUrl = knownUrl;
        found = true;
        break;
      }
    }
    if (!found) {
      let bestLength = 0;
      for (const knownUrl of knownUrls) {
        if (knownUrl.startsWith(fragment) && knownUrl.length > bestLength) {
          resolvedUrl = knownUrl;
          bestLength = knownUrl.length;
          found = true;
        }
      }
    }
    if (!found) {
      let bestLength = 0;
      for (const knownUrl of knownUrls) {
        if (fragment.startsWith(knownUrl) && knownUrl.length > bestLength) {
          resolvedUrl = knownUrl;
          bestLength = knownUrl.length;
        }
      }
    }

    ranges.push({ start, end: start + fragment.length, url: resolvedUrl });
    if (resolvedUrl.length > fragment.length && resolvedUrl.startsWith(fragment)) {
      nextPending = { url: resolvedUrl, consumed: fragment.length };
    }
  }

  return { ranges, pending: nextPending };
}

function applyOsc8Ranges(line: string, ranges: UrlRange[]): string {
  if (ranges.length === 0) {
    return line;
  }

  const urlAt = new Map<number, string>();
  for (const range of ranges) {
    for (let position = range.start; position < range.end; position++) {
      urlAt.set(position, range.url);
    }
  }

  let result = "";
  let visiblePosition = 0;
  let activeUrl: string | null = null;
  let index = 0;
  while (index < line.length) {
    if (line.charCodeAt(index) === 0x1b) {
      const sgr = line.slice(index).match(SGR_START_RE);
      if (sgr) {
        result += sgr[0];
        index += sgr[0].length;
        continue;
      }
      const osc = line.slice(index).match(OSC8_START_RE);
      if (osc) {
        result += osc[0];
        index += osc[0].length;
        continue;
      }
    }

    const targetUrl = urlAt.get(visiblePosition) ?? null;
    if (targetUrl !== activeUrl) {
      if (activeUrl !== null) {
        result += `${ESC}]8;;${BEL}`;
      }
      if (targetUrl !== null) {
        result += `${ESC}]8;;${targetUrl}${BEL}`;
      }
      activeUrl = targetUrl;
    }

    result += line[index];
    visiblePosition++;
    index++;
  }

  if (activeUrl !== null) {
    result += `${ESC}]8;;${BEL}`;
  }
  return result;
}

export function addOsc8Hyperlinks(lines: string[], urls: string[]): string[] {
  if (urls.length === 0) {
    return lines;
  }

  let pending: { url: string; consumed: number } | null = null;
  return lines.map((line) => {
    const visible = stripAnsi(line);
    const result = findUrlRanges(visible, urls, pending);
    pending = result.pending;
    return applyOsc8Ranges(line, result.ranges);
  });
}
