export function isNetworkError(errorMessage: string): boolean {
  const networkErrorPatterns = [
    "Failed to connect to github.com",
    "Couldn't connect to server",
    "Connection timed out",
    "Network is unreachable",
    "Name or service not known",
    "Temporary failure in name resolution",
    "unable to access",
    "Could not resolve host",
    "SSL connect error",
    "OpenSSL SSL_connect",
    "gnutls_handshake() failed",
  ];

  return networkErrorPatterns.some((pattern) =>
    errorMessage.toLowerCase().includes(pattern.toLowerCase())
  );
}