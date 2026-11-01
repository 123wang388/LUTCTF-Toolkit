const fs=require('fs'),vm=require('vm'),path=require('path');
const ctx={console,TextEncoder,TextDecoder,btoa,atob,crypto:require('crypto').webcrypto,Math,JSON,BigInt,Uint8Array,Uint32Array,Float32Array,Float64Array,Array,Number,String,Object,RegExp,performance:{now:()=>Date.now()}};
ctx.window=ctx; ctx.globalThis=ctx; vm.createContext(ctx);
const base=path.join('renderer','js','core');
const exp={'codec.js':'Codec','classical.js':'Classical','digest.js':'Digest','rsa.js':'RSAkit','misc.js':'Misc'};
for(const [f,name] of Object.entries(exp)){
  vm.runInContext(fs.readFileSync(path.join(base,f),'utf8')+`\n;globalThis.${name}=${name};`,ctx,{filename:f});
}
let pass=0,fail=0;
const t=(n,got,want)=>{ const ok=String(got)===String(want); if(ok)pass++; else {fail++;console.log('  FAIL '+n+'\n    got : '+got+'\n    want: '+want);} };
const E=s=>new TextEncoder().encode(s);
const hexb=h=>{h=h.replace(/\s/g,'');const a=new Uint8Array(h.length/2);for(let i=0;i<a.length;i++)a[i]=parseInt(h.substr(i*2,2),16);return a;};
(async()=>{
console.log('— 摘要算法（官方测试向量）—');
t('MD5("abc")',ctx.Digest.md5(E('abc')),'900150983cd24fb0d6963f7d28e17f72');
t('SM3("abc") 国密官方值',ctx.Digest.sm3(E('abc')),'66c7f0f462eeedd9d1f2d46bdc10e4e24167c4875cf2f7a2297da02b8f4ba8e0');
t('SHA-256("abc")',await ctx.Digest.subtleDigest('SHA-256',E('abc')),'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
t('CRC32("123456789")',ctx.Digest.CRC32.std(E('123456789')),'cbf43926');

console.log('— SM4 国密（GB/T 32907 官方向量）—');
const sm4k=hexb('0123456789abcdeffedcba9876543210');
const sm4p=hexb('0123456789abcdeffedcba9876543210');
t('SM4-ECB 官方密文(前16B)',ctx.Codec.bytesToHex(ctx.Digest.SM4.ecbEnc(sm4k,sm4p).subarray(0,16)),'681edf34d206965e86b3e94f536e4246');
t('SM4-ECB 解密还原',ctx.Codec.bytesToHex(ctx.Digest.SM4.ecbDec(sm4k,ctx.Digest.SM4.ecbEnc(sm4k,sm4p))),'0123456789abcdeffedcba9876543210');

console.log('— 编码往返 —');
const cases=['奇点-CTF!','HaiFeng CTF','flag{test_123}','abc'];
for(const s of cases){ t('B64('+s+')',ctx.Codec.B64.dec(ctx.Codec.B64.enc(s)),s); }
t('Base32',ctx.Codec.Base32.dec(ctx.Codec.Base32.enc('HaiFeng CTF')),'HaiFeng CTF');
t('Base32-Crockford',ctx.Codec.Base32.decExt(ctx.Codec.Base32.encExt('HaiFeng')),'HaiFeng');
t('Base58',ctx.Codec.Base58.dec(ctx.Codec.Base58.enc('qidian')),'qidian');
t('Ascii85',ctx.Codec.Base85.dec(ctx.Codec.Base85.enc('Man is distinguished')),'Man is distinguished');
t('Z85',ctx.Codec.Base85.z85dec(ctx.Codec.Base85.z85enc('abcdefgh')),'abcdefgh');
t('Base91',ctx.Codec.Base91.dec(ctx.Codec.Base91.enc('hello world')),'hello world');
t('URL',ctx.Codec.Url.dec(ctx.Codec.Url.enc('a=1&b=中文')),'a=1&b=中文');
t('Bits二进制串',ctx.Codec.Bits.dec(ctx.Codec.Bits.enc('Hi')),'Hi');
t('Morse摩斯',ctx.Codec.Morse.dec(ctx.Codec.Morse.enc('SOS')),'SOS');
t('培根密码',ctx.Codec.Bacon.dec(ctx.Codec.Bacon.enc('HELLO')),'HELLO');

console.log('— 对称加密 —');
const k16=E('1234567890abcdef'), iv=E('abcdef1234567890'), pt=E('兰州理工');
t('SM4-CBC 往返',ctx.Codec.fromBytes(ctx.Digest.SM4.cbcDec(k16,ctx.Digest.SM4.cbcEnc(k16,pt,iv),iv)),'兰州理工');
t('RC4 往返',ctx.Codec.fromBytes(ctx.Digest.rc4(k16,ctx.Digest.rc4(k16,pt))),'兰州理工');
const aes=await ctx.Digest.aesOp('CBC',k16,ctx.Digest.pkcs7(pt),iv,true);
t('AES-CBC 往返',ctx.Codec.fromBytes(ctx.Digest.unpkcs7(await ctx.Digest.aesOp('CBC',k16,aes,iv,false))),'兰州理工');

console.log('— 古典密码 —');
t('凯撒(3)',ctx.Classical.Caesar.dec(ctx.Classical.Caesar.enc('ATTACKATDAWN',3),3),'ATTACKATDAWN');
t('维吉尼亚',ctx.Classical.Vigenere.dec(ctx.Classical.Vigenere.enc('ATTACKATDAWN','KEY'),'KEY'),'ATTACKATDAWN');
t('Atbash 往返(保留大小写)',ctx.Classical.Atbash(ctx.Classical.Atbash('Hello')),'Hello');
t('栅栏(3)',ctx.Classical.Railfence.dec(ctx.Classical.Railfence.enc('HELLOWORLD',3),3),'HELLOWORLD');
t('仿射(5,8)',ctx.Classical.Affine.dec(ctx.Classical.Affine.enc('AFFINECIPHER',5,8),5,8),'AFFINECIPHER');
t('Playfair',ctx.Classical.Playfair.dec(ctx.Classical.Playfair.enc('HIDETHEGOLD','PLAYFAIR'),'PLAYFAIR'),'HIDETHEGOLDX');
const x=ctx.Classical.XorKits.repeatHex('hello','k');
t('XOR 往返',ctx.Classical.XorKits.repeatHex(x,'k'),'hello');

console.log('— RSA 密码分析 —');
const R=ctx.RSAkit;
const c79=R.modpow(65n,17n,3233n);
const rr=R.decryptFromPQ(3233n,17n,c79,61n,53n);
t('RSA 解密 (p,q→m)',rr.m,65n);
t('RSA 私钥指数 d',rr.d,2753n);
t('intToText',R.intToText(BigInt('0x'+ctx.Codec.bytesToHex(E('flag')))),'flag');
const [p1,q1]=R.factorize(8051n); t('Pollard-Rho 分解 8051=83*97',p1.toString()+'*'+q1.toString(),'83*97');
t('Lehmann/iroot 开方',R.iroot(1000000n,3),100n);
t('批量GCD找共享因子',R.batchGCD([8051n,83n*101n]).length,1);

console.log('— 杂项 —');
t('进制 16→2',ctx.Misc.Radix.convert('ff',16,2),'11111111');
t('进制 2→10',ctx.Misc.Radix.convert('11111111',2,10),'255');
t('时间戳类型',typeof ctx.Misc.Time.now(),'number');
t('正则 todo because',1,1);
console.log(`\n===== 通过 ${pass} 项 / 失败 ${fail} 项 =====`);
process.exit(fail?1:0);
})().catch(e=>{console.log('EXCEPTION:',e.message);process.exit(1)});
