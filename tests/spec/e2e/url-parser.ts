/**
 * @arch archcodex.test.fixture
 *
 * URL parser implementation fixture for spec verification.
 */

export function parseUrl(args: {
  url: string;
}): {
  protocol?: string;
  host?: string;
  path?: string;
  query?: Record<string, string>;
  error?: string;
} {
  const { url } = args;

  if (!url) {
    return { error: 'EMPTY_URL' };
  }

  try {
    const parsed = new URL(url);
    const query: Record<string, string> = {};
    parsed.searchParams.forEach((v, k) => {
      query[k] = v;
    });

    return {
      protocol: parsed.protocol.replace(':', ''),
      host: parsed.host,
      path: parsed.pathname,
      query: Object.keys(query).length > 0 ? query : undefined,
    };
  } catch {
    return { error: 'INVALID_FORMAT' };
  }
}
