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

async function handleRequest(request) {
  if (request.method === 'OPTIONS') {
    return handleOptionsRequest();
  }

  const method = request.method;
  const url = new URL(request.url);
  const path = url.pathname + url.search;
  
  // 创建新的请求头，只包含必要的信息
  const headers = new Headers();
  
  // 复制必要的请求头
  const necessaryHeaders = ['authorization', 'content-type', 'content-length', 'transfer-encoding', 'content-encoding', 'accept'];
  for (const header of necessaryHeaders) {
    const value = request.headers.get(header);
    if (value) {
      headers.set(header, value);
    }
  }
  
  console.log(`Request headers1: ${headersToString(request.headers)}`);
  console.log(`Request headers2: ${headersToString(headers)}`);
  
  const authHeader = headers.get('Authorization');
  if (!authHeader) {
    return new Response('Missing Authorization header', { status: 401 });
  }

  const apiUrl = `https://api.x.ai${path}`;

  const apiRequest = new Request(apiUrl, {
    method: method,
    headers: headers,
    body: method !== 'GET' && method !== 'HEAD' ? request.body : null,
  });

  const apiResponse = await fetch(apiRequest);

  const response = new Response(apiResponse.body, apiResponse);
  // 复制流式传输相关的响应头
  const streamHeaders = ['transfer-encoding', 'content-encoding', 'content-length', 'content-type'];
  streamHeaders.forEach(header => {
    const value = apiResponse.headers.get(header);
    if (value) response.headers.set(header, value);
  });
  response.headers.set('Access-Control-Allow-Origin', '*');
  response.headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  response.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  response.headers.set('Cache-Control', 'no-cache');
  response.headers.set('Connection', 'keep-alive');

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
