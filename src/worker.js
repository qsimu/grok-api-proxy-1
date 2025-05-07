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
  const firstSegment = [1, 2, 3, 5, 8, 9, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 26, 28, 29, 30, 33, 34, 35, 38, 40, 41, 42, 43, 44, 45, 46, 47, 48, 49, 50, 51, 52, 53, 54, 55, 56, 57, 58, 59, 60, 61, 62, 63, 64, 65, 66, 67, 68, 69, 70, 71, 72, 73, 74, 75, 76, 77, 78, 79, 80, 81, 82, 83, 84, 85, 86, 87, 88, 89, 90, 91, 92, 93, 94, 95, 96, 97, 98, 99, 101, 102, 103, 104, 105, 106, 107, 108, 109, 110, 111, 112, 113, 114, 115, 116, 117, 118, 119, 120, 121, 122, 123, 124, 125, 126, 129, 130, 131, 132, 133, 134, 135, 136, 137, 138, 139, 140, 141, 142, 143, 144, 145, 146, 147, 148, 149, 150, 151, 152, 153, 154, 155, 156, 157, 158, 159, 160, 161, 162, 163, 164, 165, 166, 167, 168, 169, 170, 171, 172, 173, 174, 175, 176, 177, 178, 179, 180, 181, 182, 183, 184, 185, 186, 187, 188, 189, 190, 191, 192, 193, 194, 195, 196, 197, 198, 199, 200, 201, 202, 203, 204, 205, 206, 207, 208, 209, 210, 211, 212, 213, 214, 215, 216, 217, 218, 219, 220, 221, 222, 223];
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
  
  // 创建新的请求头，而不是修改原始请求头
  const headers = new Headers();
  
  // 只复制必要的请求头
  const necessaryHeaders = ['accept', 'accept-encoding', 'authorization', 'content-type', 'content-length'];
  for (const header of necessaryHeaders) {
    const value = request.headers.get(header);
    if (value) {
      headers.set(header, value);
    }
  }
  
  // 设置一个通用的 User-Agent 来避免指纹识别
  headers.set('User-Agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36');
  
  // 设置随机IP作为X-Forwarded-For，可能有助于绕过IP限制
  const randomIP = getRandomIP();
  headers.set('X-Forwarded-For', randomIP);
  headers.set('X-Real-IP', randomIP);
  
  // 设置host为目标域名，避免通过host头识别代理
  headers.set('Host', 'api.x.ai');
  
  // 移除可能会泄露真实IP的请求头
  console.log(`Request headers1: ${headersToString(request.headers)}`);
  console.log(`Request headers2: ${headersToString(headers)}`);
  
  const authHeader = headers.get('Authorization');
  if (!authHeader) {
    return new Response('Missing Authorization header', { status: 401 });
  }

  const apiUrl = `https://api.x.ai${path}`;

  // 创建新的请求对象
  let apiRequest = new Request(apiUrl, {
    method: method,
    headers: headers,
    body: method !== 'GET' && method !== 'HEAD' ? await request.blob() : null,
    // 禁用WebRTC，防止IP泄露
    cf: {
      resolveOverride: 'api.x.ai',
      cacheEverything: false
    }
  });

  // 尝试多次请求，如果遇到限制则使用不同的随机IP重试
  let apiResponse;
  let retryCount = 0;
  const maxRetries = 3;
  
  while (retryCount < maxRetries) {
    try {
      apiResponse = await fetch(apiRequest);
      
      // 如果响应成功或者不是因为IP限制导致的错误，则跳出循环
      if (apiResponse.status !== 403 && apiResponse.status !== 429) {
        break;
      }
      
      // 如果是IP限制错误，则重试
      console.log(`请求被限制，状态码: ${apiResponse.status}，尝试重试...`);
      
      // 更新随机IP并重试
      const newRandomIP = getRandomIP();
      headers.set('X-Forwarded-For', newRandomIP);
      headers.set('X-Real-IP', newRandomIP);
      
      // 更新请求对象
      apiRequest = new Request(apiUrl, {
        method: method,
        headers: headers,
        body: method !== 'GET' && method !== 'HEAD' ? await request.blob() : null,
        cf: {
          resolveOverride: 'api.x.ai',
          cacheEverything: false
        }
      });
      
    } catch (error) {
      console.error(`请求出错: ${error.message}`);
    }
    
    retryCount++;
    
    // 如果不是最后一次重试，则等待一段时间再重试
    if (retryCount < maxRetries) {
      await new Promise(resolve => setTimeout(resolve, 1000));
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
