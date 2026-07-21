const { randomBytes } = await import('crypto'); // or require('crypto')
const key = randomBytes(32);
const base64Key = key.toString('base64');
console.log(base64Key);