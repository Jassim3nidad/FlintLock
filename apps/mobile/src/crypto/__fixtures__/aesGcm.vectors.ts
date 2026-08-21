/**
 * AES-256-GCM known-answer vector, sourced from the Go standard library's
 * `aesGCMTests` table (crypto/cipher/gcm_test.go, NIST-CAVP-derived),
 * fetched directly from github.com/golang/go and parsed programmatically
 * (not hand-transcribed) to avoid hex transcription errors. Field byte
 * lengths were cross-checked (result length == plaintext length + 16)
 * before inclusion.
 *
 * `result` is ciphertext || 16-byte authTag, as Go's table stores it;
 * split at parse time in the test.
 */
export const AES_256_GCM_VECTOR = {
  name: 'Go stdlib aesGCMTests (32-byte key, 12-byte nonce, non-empty pt+aad)',
  keyHex:
    '5394e890d37ba55ec9d5f327f15680f6a63ef5279c79331643ad0af6d2623525'.slice(0, 64),
  nonceHex: '815e840b7aca7af3b324583f',
  plaintextHex:
    '8e63067cd15359f796b43c68f093f55fdf3589fc5f2fdfad5f9d156668a617f7091d73da71cdd207810e6f71a165d0809a597df9885ca6e8f9bb4e616166586b83cc45f49917fc1a256b8bc7d05c476ab5c4633e20092619c4747b26dad3915e9fd65238ee4e5213badeda8a3a22f5efe6582d0762532026c89b4ca26fdd000eb45347a2a199b55b7790e6b1b2dba19833ce9f9522c0bcea5b088ccae68dd99ae0203c81b9f1dd3181c3e2339e83ccd1526b67742b235e872bea5111772aab574ae7d904d9b6355a79178e179b5ae8edc54f61f172bf789ea9c9af21f45b783e4251421b077776808f04972a5e801723cf781442378ce0e0568f014aea7a882dcbcb48d342be53d1c2ebfb206b12443a8a587cc1e55ca23beca385d61d0d03e9d84cbc1b0a',
  aadHex: '0feccdfae8ed65fa31a0858a1c466f79e8aa658c2f3ba93c3f92158b4e30955e1c62580450beff',
  resultHex:
    'b69a7e17bb5af688883274550a4ded0d1aff49a0b18343f4b382f745c163f7f714c9206a32a1ff012427e19431951edd0a755e5f491b0eedfd7df68bbc6085dd2888607a2f998c3e881eb1694109250db28291e71f4ad344a125624fb92e16ea9815047cd1111cabfdc9cb8c3b4b0f40aa91d31774009781231400789ed545404af6c3f76d07ddc984a7bd8f52728159782832e298cc4d529be96d17be898efd83e44dc7b0e2efc645849fd2bba61fef0ae7be0dcab233cc4e2b7ba4e887de9c64b97f2a1818aa54371a8d629dae37975f7784e5e3cc77055ed6e975b1e5f55e6bbacdc9f295ce4ada2c16113cd5b323cf78b7dde39f4a87aa8c141a31174e3584ccbd380cf5ec6d1dba539928b084fa9683e9c0953acf47cc3ac384a2c38914f1da01fb2cfd78905c2b58d36b2574b9df15535d82',
};
