export const truncate = (s: string, max = 2048) => (s.length > max ? `${s.slice(0, max)}…` : s);

export const errorToDebug = (error: unknown) => {
  if (error instanceof Error) {
    return { name: error.name, message: error.message, cause: (error as any).cause };
  }
  return { message: String(error) };
};

export const nonOkResponseDetail = async (response: Response, url: string) => {
  const statusText = response?.statusText;
  const contentType = response.headers.get('content-type') ?? undefined;
  let bodyText: string | undefined;
  let bodyJson: unknown | undefined;
  try {
    const rawText = await response.text();
    bodyText = truncate(rawText);
    const wasTruncated = bodyText.length !== rawText.length;
    if (!wasTruncated && contentType?.includes('application/json')) {
      try {
        bodyJson = JSON.parse(rawText);
      } catch {
        bodyJson = undefined;
      }
    }
  } catch {
    bodyText = undefined;
  }
  return { status: response.status, statusText, url, contentType, bodyText, bodyJson };
};
