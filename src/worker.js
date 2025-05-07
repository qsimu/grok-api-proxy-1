addEventListener('fetch', event => {
  event.respondWith(handleRequest(event.request));
});
// 打印 headers 的辅助函数
function headersToString(headerObj) {
  const obj = {};
  for (const [key, value] of headerObj.entries()) {
    obj[key] = value;
  }
  return JSON.stringify(obj, null, 2);
}
// 生成随机IP地址，用于伪装请求来源
function getRandomIP() {
  // 生成一个随机的合法公网IP地址
  // 避开保留IP范围
  const segments = [];
  // 第一段避开保留IP范围
  const firstSegment = [53, 153];
  segments.push(firstSegment[Math.floor(Math.random() * firstSegment.length)]);
  
  // 其他三段可以是0-255的任意值
  for (let i = 0; i < 3; i++) {
    segments.push(Math.floor(Math.random() * 256));
  }
  
  return segments.join('.');
}

async function handleRequest(request) {
  if (request.method === 'OPTIONS') {
    return handleOptionsRequest();
  }

  const method = request.method;
  const url = new URL(request.url);
  const path = url.pathname + url.search;
  
  // 创建新的请求头，完全隔离原始请求头
  const headers = new Headers();
  
  // 只复制绝对必要的请求头
  const necessaryHeaders = ['authorization', 'content-type', 'content-length'];
  for (const header of necessaryHeaders) {
    const value = request.headers.get(header);
    if (value) {
      headers.set(header, value);
    }
  }
  
  // 设置随机IP
  const randomIP = getRandomIP();
  
  // 设置代理相关头部，模拟多层代理
  headers.set('X-Forwarded-For', `${randomIP}, 10.0.0.1`);
  headers.set('X-Real-IP', randomIP);
  headers.set('Via', '1.1 varnish, 1.1 squid');
  headers.set('Forwarded', `for=${randomIP};proto=https`);
  
  // 设置通用请求头
  headers.set('Accept', '*/*');
  headers.set('Accept-Encoding', 'gzip, deflate, br');
  headers.set('Accept-Language', 'en-US,en;q=0.9');
  headers.set('Cache-Control', 'no-cache');
  headers.set('Connection', 'keep-alive');
  headers.set('DNT', '1');
  headers.set('Host', 'api.x.ai');
  headers.set('Origin', 'https://api.x.ai');
  headers.set('Pragma', 'no-cache');
  headers.set('Referer', 'https://api.x.ai/');
  headers.set('Sec-Fetch-Dest', 'empty');
  headers.set('Sec-Fetch-Mode', 'cors');
  headers.set('Sec-Fetch-Site', 'same-origin');
  headers.set('User-Agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
  
  // 移除可能泄露真实信息的头部
  const removeHeaders = [
    'cf-connecting-ip',
    'true-client-ip',
    'fastly-client-ip',
    'x-cluster-client-ip',
    'x-forwarded',
    'forwarded-for',
    'x-coming-from',
    'coming-from',
    'client-ip'
  ];
  
  removeHeaders.forEach(header => {
    headers.delete(header);
  });
  
  // 移除可能会泄露真实IP的请求头
  console.log(`Request headers1: ${headersToString(request.headers)}`);
  console.log(`Request headers2: ${headersToString(headers)}`);
  
  const authHeader = headers.get('Authorization');
  if (!authHeader) {
    return new Response('Missing Authorization header', { status: 401 });
  }

  const apiUrl = `https://api.x.ai${path}`;

  // 克隆原始请求体以供重试使用
  let requestBody = null;
  if (method !== 'GET' && method !== 'HEAD') {
    const clonedRequest = request.clone();
    requestBody = await clonedRequest.blob();
  }

  // 尝试多次请求，如果遇到限制则使用不同的随机IP重试
  let apiResponse;
  let retryCount = 0;
  const maxRetries = 5;

  // 创建请求对象的函数
  const createApiRequest = (randomIP) => {
    // 更新代理相关头部
    headers.set('X-Forwarded-For', `${randomIP}, 10.0.0.1`);
    headers.set('X-Real-IP', randomIP);
    headers.set('Via', `1.1 varnish-v${Math.floor(Math.random() * 5) + 1}, 1.1 squid-v${Math.floor(Math.random() * 3) + 1}`);
    headers.set('Forwarded', `for=${randomIP};proto=https`);
    
    // 随机化一些请求头
    headers.set('Accept-Language', ['en-US,en;q=0.9', 'en-GB,en;q=0.8', 'en-CA,en;q=0.7'][Math.floor(Math.random() * 3)]);
    headers.set('User-Agent', [
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Edge/120.0.0.0 Safari/537.36'
    ][Math.floor(Math.random() * 3)]);

    return new Request(apiUrl, {
      method: method,
      headers: headers,
      body: requestBody,
      cf: {
        resolveOverride: 'api.x.ai',
        cacheEverything: false
      }
    });
  };

  // 创建初始请求
  let apiRequest = createApiRequest(getRandomIP());
  
  while (retryCount < maxRetries) {
    try {
      apiResponse = await fetch(apiRequest);
      
      // 如果响应成功或者不是因为IP限制导致的错误，则跳出循环
      if (apiResponse.status !== 403 && apiResponse.status !== 429) {
        break;
      }
      
      // 如果是IP限制错误，则重试
      console.log(`请求被限制，状态码: ${apiResponse.status}，第${retryCount + 1}次重试...`);
      
      // 生成新的随机IP并更新请求
      apiRequest = createApiRequest(getRandomIP());
      
    } catch (error) {
      console.error(`请求出错: ${error.message}`);
    }
    
    retryCount++;
    
    // 如果不是最后一次重试，则等待随机时间再重试
    if (retryCount < maxRetries) {
      const delay = Math.floor(Math.random() * 2000) + 1000; // 1-3秒随机延迟
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
  
  // 如果所有重试都失败，则返回最后一次的响应
  if (!apiResponse) {
    return new Response('无法连接到API服务', { status: 502 });
  }
  
  // 创建新的响应对象，清除可能泄露信息的响应头
  const responseHeaders = new Headers();
  
  // 只复制必要的响应头
  const necessaryResponseHeaders = [
    'content-type', 'content-length', 'date', 'cache-control', 'expires'
  ];
  
  for (const header of necessaryResponseHeaders) {
    const value = apiResponse.headers.get(header);
    if (value) {
      responseHeaders.set(header, value);
    }
  }
  
  // 设置CORS头
  responseHeaders.set('Access-Control-Allow-Origin', '*');
  responseHeaders.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  responseHeaders.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  
  // 创建新的响应
  const response = new Response(apiResponse.body, {
    status: apiResponse.status,
    statusText: apiResponse.statusText,
    headers: responseHeaders
  });
  
  return response;
  }
  
  function handleOptionsRequest() {
    const headers = new Headers();
    headers.set('Access-Control-Allow-Origin', '*');
    headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    headers.set('Access-Control-Max-Age', '86400');
    return new Response(null, { headers });
  }
