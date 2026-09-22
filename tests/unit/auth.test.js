import { describe, it, expect, vi, afterEach } from "vitest";
import { createTokenClient, revokeToken } from "../../js/auth.js";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("createTokenClient", () => {
  it("initializes the underlying Google token client with the given client id and scope", () => {
    const initTokenClient = vi.fn().mockReturnValue({ requestAccessToken: vi.fn() });
    vi.stubGlobal("google", { accounts: { oauth2: { initTokenClient } } });

    createTokenClient("client-123", "some.scope", vi.fn(), vi.fn());

    expect(initTokenClient).toHaveBeenCalledTimes(1);
    const config = initTokenClient.mock.calls[0][0];
    expect(config.client_id).toBe("client-123");
    expect(config.scope).toBe("some.scope");
    expect(typeof config.callback).toBe("function");
  });

  it("calls onToken with the access token and expires_in on a successful response", () => {
    let capturedCallback;
    const initTokenClient = vi.fn().mockImplementation((cfg) => {
      capturedCallback = cfg.callback;
      return { requestAccessToken: vi.fn() };
    });
    vi.stubGlobal("google", { accounts: { oauth2: { initTokenClient } } });

    const onToken = vi.fn();
    const onError = vi.fn();
    createTokenClient("client-123", "scope", onToken, onError);

    capturedCallback({ access_token: "tok-abc", expires_in: 3600 });

    expect(onToken).toHaveBeenCalledWith("tok-abc", 3600);
    expect(onError).not.toHaveBeenCalled();
  });

  it("calls onError (not onToken) when the response has an error", () => {
    let capturedCallback;
    const initTokenClient = vi.fn().mockImplementation((cfg) => {
      capturedCallback = cfg.callback;
      return { requestAccessToken: vi.fn() };
    });
    vi.stubGlobal("google", { accounts: { oauth2: { initTokenClient } } });

    const onToken = vi.fn();
    const onError = vi.fn();
    createTokenClient("client-123", "scope", onToken, onError);

    capturedCallback({ error: "access_denied" });

    expect(onError).toHaveBeenCalledWith("access_denied");
    expect(onToken).not.toHaveBeenCalled();
  });

  it("returns the token client object from initTokenClient", () => {
    const fakeClient = { requestAccessToken: vi.fn() };
    vi.stubGlobal("google", { accounts: { oauth2: { initTokenClient: () => fakeClient } } });
    const client = createTokenClient("id", "scope", vi.fn(), vi.fn());
    expect(client).toBe(fakeClient);
  });
});

describe("revokeToken", () => {
  it("calls google.accounts.oauth2.revoke with the token", () => {
    const revoke = vi.fn((token, cb) => cb());
    vi.stubGlobal("google", { accounts: { oauth2: { revoke } } });

    revokeToken("tok-xyz");

    expect(revoke).toHaveBeenCalledTimes(1);
    expect(revoke.mock.calls[0][0]).toBe("tok-xyz");
  });
});
