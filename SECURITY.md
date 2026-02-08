# Security Policy

## Supported Versions

| Version | Supported |
| ------- | --------- |
| 0.1.x   | Yes       |

## Reporting a Vulnerability

If you discover a security vulnerability in @ocash/sdk, please report it responsibly:

1. **Do NOT** open a public GitHub issue
2. Email security concerns to: **security@ocash.io**
3. Include a description of the vulnerability, steps to reproduce, and potential impact
4. You will receive an acknowledgment within 48 hours

## Security Considerations

This SDK handles cryptographic operations including:

- BabyJubjub key derivation
- Poseidon2 hashing for commitments and nullifiers
- zk-SNARK proof generation (via Go WASM)
- ECDH key exchange and NaCl memo encryption

### Known Limitations

- **JS BigInt immutability**: Secret keys stored as BigInt cannot be securely zeroed in memory. The SDK nullifies references on `wallet.close()`, but actual clearing depends on garbage collection.
- **Worker key transport**: The proof worker receives secret key material via `postMessage` (structured clone). This is a JS platform limitation with no practical alternative in browser environments.
- **WASM execution**: The Go WASM bridge uses `new Function()` to execute the downloaded `wasm_exec.js` runtime. Ensure asset URLs are trusted.

## Best Practices for Integrators

- Always serve WASM/circuit assets over HTTPS from trusted origins
- Set appropriate CSP headers when using the browser entry point
- Use `wallet.close()` when done to release key material references
- Consider `maxOperations` on persistent stores to limit stored data
