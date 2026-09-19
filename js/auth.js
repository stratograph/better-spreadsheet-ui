export function createTokenClient(clientId, scope, onToken, onError) {
  return google.accounts.oauth2.initTokenClient({
    client_id: clientId,
    scope,
    callback: (resp) => {
      if (resp.error) {
        onError(resp.error);
        return;
      }
      onToken(resp.access_token);
    },
  });
}

export function revokeToken(token) {
  google.accounts.oauth2.revoke(token, () => {});
}
