
import {
  generateApiKey,
  hashApiKey
} from "./apiKey.js";

const generated = generateApiKey();
const repeatedHash = hashApiKey(generated.fullKey);

console.log("API key prefix:", generated.keyPrefix);
console.log("Hash length:", generated.keyHash.length);
console.log("Hash matches:", generated.keyHash === repeatedHash);
console.log(
  "Raw key excluded from hash field:",
  generated.keyHash !== generated.fullKey
);
