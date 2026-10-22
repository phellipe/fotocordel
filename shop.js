/* Shared static storefront. Price, payment and download authorization belong to the API. */
(() => {
  'use strict';
  const scriptURL = document.currentScript?.src || new URL('shop.js', location.href).href;
  const siteRoot = new URL('./', scriptURL);
  const config = window.FOTOCORDEL_SHOP_CONFIG || {};
  const isReturn = document.body.hasAttribute('data-shop-return');
  const edition = location.pathname.startsWith(new URL('v2/', siteRoot).pathname) ? 'v2' : 'v1';
  const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  const TOKEN = /^[0-9a-f]{64}$/;
  const PREFIX = 'fotocordel.shop.';
  const money = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
  let selectedPhoto = null;
  let purchaseMount;
  let catalogPromise;
  let checkoutPending = false;

  function apiBaseURL() {
    if (config.enabled !== true || typeof config.apiBase !== 'string' || !config.apiBase.trim()) return null;
    try {
      const value = new URL(config.apiBase);
      const localHosts = ['localhost', '127.0.0.1', '[::1]'];
      const localPreview = localHosts.includes(location.hostname) && localHosts.includes(value.hostname);
      if (value.protocol !== 'https:' && !(localPreview && value.protocol === 'http:')) return null;
      if (value.username || value.password || value.search || value.hash) return null;
      return value.href.replace(/\/$/, '');
    } catch { return null; }
  }
  const apiBase = apiBaseURL();
  const configured = Boolean(apiBase);

  class ShopError extends Error {
    constructor(message, code = 'unknown') { super(message); this.code = code; }
  }
  function node(tag, className, text) {
    const result = document.createElement(tag);
    if (className) result.className = className;
    if (text) result.textContent = text;
    return result;
  }
  function readStored(key) {
    try { return JSON.parse(sessionStorage.getItem(PREFIX + key) || 'null'); }
    catch { return null; }
  }
  function writeStored(key, value) {
    try {
      const serialized = JSON.stringify(value);
      sessionStorage.setItem(PREFIX + key, serialized);
      if (sessionStorage.getItem(PREFIX + key) !== serialized) throw new Error();
    } catch {
      throw new ShopError('Seu navegador não conseguiu guardar o acesso ao arquivo. Permita o armazenamento desta aba antes de continuar.', 'storage');
    }
  }
  function clearAttempt(order) {
    if (!order?.photoId || !order?.edition || !order?.requestId) return false;
    const key = `attempt.${order.edition}.${order.photoId}`;
    const attempt = readStored(key);
    if (!attempt) return true;
    if (attempt.requestId !== order.requestId || attempt.buyerToken !== order.buyerToken) return false;
    try {
      // Only the retry slot is discarded; order.<id> retains the previous access token.
      sessionStorage.removeItem(PREFIX + key);
      return sessionStorage.getItem(PREFIX + key) === null;
    } catch { return false; }
  }
  function dimensions(photo) {
    return Number.isInteger(photo?.width) && photo.width > 0 && Number.isInteger(photo?.height) && photo.height > 0
      ? `${photo.width} × ${photo.height} pixels` : '';
  }
  function validProduct(photo) {
    return photo && typeof photo.id === 'string' && typeof photo.title === 'string'
      && Number.isInteger(photo.amount) && photo.amount >= 0 && photo.currency === 'brl'
      && typeof photo.license === 'string' && Boolean(dimensions(photo));
  }
  async function request(path, options = {}, binary = false) {
    if (!configured) throw new ShopError('As vendas ainda não estão disponíveis neste site.', 'disabled');
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), 20000);
    try {
      const response = await fetch(`${apiBase}${path}`, {
        ...options, signal: controller.signal, mode: 'cors', credentials: 'omit', cache: 'no-store',
        redirect: 'error', referrerPolicy: 'no-referrer',
        headers: { Accept: binary ? 'image/jpeg, application/json' : 'application/json', ...options.headers },
      });
      if (!response.ok) {
        let problem;
        try { problem = await response.json(); } catch { /* Use status-based copy below. */ }
        const code = problem?.error?.code || `http_${response.status}`;
        if (response.status === 401 || response.status === 403) throw new ShopError('O acesso a este pedido não pôde ser confirmado nesta sessão do navegador.', code);
        if (response.status === 404) throw new ShopError('Este pedido ou arquivo não foi encontrado. Confira se abriu o endereço completo.', code);
        if (response.status === 429) throw new ShopError('Há muitas tentativas neste momento. Aguarde um pouco e tente novamente.', code);
        throw new ShopError('Não foi possível concluir a consulta agora. Aguarde um momento e tente novamente.', code);
      }
      if (binary) return response;
      try { return await response.json(); }
      catch { throw new ShopError('O serviço retornou uma resposta incompleta. Tente novamente.', 'invalid_response'); }
    } catch (error) {
      if (error instanceof ShopError) throw error;
      throw new ShopError(error.name === 'AbortError'
        ? 'A consulta demorou mais que o esperado. Tente novamente sem iniciar outra compra.'
        : 'Não foi possível conectar ao serviço. Confira sua conexão e tente novamente.', 'network');
    } finally { window.clearTimeout(timer); }
  }
  function getCatalog() {
    if (!catalogPromise) {
      catalogPromise = request('/catalog').then(data => {
        if (!['test', 'live'].includes(data.mode) || !Array.isArray(data.products)) throw new ShopError('Catálogo indisponível.', 'invalid_catalog');
        return { mode: data.mode, products: data.products.filter(validProduct) };
      }).catch(error => { catalogPromise = null; throw error; });
    }
    return catalogPromise;
  }
  function getMount() {
    if (purchaseMount) return purchaseMount;
    purchaseMount = document.querySelector('#viewer-purchase');
    if (!purchaseMount) {
      const viewer = document.querySelector('.viewer-info');
      if (!viewer) return null;
      purchaseMount = node('section');
      purchaseMount.id = 'viewer-purchase';
      viewer.append(purchaseMount);
    }
    purchaseMount.classList.add('shop-purchase');
    purchaseMount.setAttribute('aria-label', 'Comprar esta fotopoesia');
    purchaseMount.hidden = true;
    return purchaseMount;
  }
  function receiptURL(orderId) {
    const url = new URL('compra.html', siteRoot);
    url.searchParams.set('pedido', orderId);
    return url.href;
  }
  function createAttempt(photoId) {
    const key = `attempt.${edition}.${photoId}`;
    const saved = readStored(key);
    if (saved && UUID.test(saved.requestId) && TOKEN.test(saved.buyerToken)
      && saved.apiBase === apiBase && saved.photoId === photoId && saved.edition === edition) return saved;
    if (!window.crypto?.getRandomValues || !window.crypto?.randomUUID) {
      throw new ShopError('Abra o endereço seguro do site para iniciar sua compra.', 'crypto');
    }
    const bytes = new Uint8Array(32);
    crypto.getRandomValues(bytes);
    const attempt = {
      requestId: crypto.randomUUID(), buyerToken: [...bytes].map(value => value.toString(16).padStart(2, '0')).join(''),
      photoId, edition, apiBase, createdAt: new Date().toISOString(),
    };
    writeStored(key, attempt); // Persist the secret and idempotency key before making a chargeable request.
    return attempt;
  }
  function safeCheckoutURL(value) {
    try {
      const url = new URL(value);
      return url.protocol === 'https:' && url.hostname === 'checkout.stripe.com' && !url.port
        && !url.username && !url.password ? url.href : null;
    } catch { return null; }
  }
  async function beginCheckout(photo, mode, button, message) {
    if (checkoutPending) return;
    checkoutPending = true;
    button.disabled = true;
    button.textContent = 'Abrindo pagamento…';
    message.dataset.error = 'false';
    message.textContent = 'Mantenha esta aba aberta até concluir o pagamento e baixar seu arquivo.';
    let attempt;
    try {
      attempt = createAttempt(photo.id);
      const data = await request('/checkout', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ photoId: photo.id, edition, requestId: attempt.requestId, buyerToken: attempt.buyerToken }),
      });
      const destination = safeCheckoutURL(data.url);
      if (!UUID.test(data.orderId) || !destination || data.mode !== mode) {
        throw new ShopError('O endereço de pagamento não pôde ser validado. A compra não foi aberta. Tente novamente.', 'checkout_response');
      }
      const order = { ...attempt, orderId: data.orderId, mode: data.mode };
      writeStored(`order.${data.orderId}`, order);
      writeStored(`attempt.${edition}.${photo.id}`, order);
      location.assign(destination);
    } catch (error) {
      message.dataset.error = 'true';
      message.textContent = error.message || 'Não foi possível abrir o pagamento. Tente novamente.';
      button.disabled = false;
      button.textContent = 'Tentar abrir pagamento';
      if (['CHECKOUT_EXPIRED', 'ORDER_ACCESS_EXPIRED'].includes(error.code) && clearAttempt(attempt)) {
        message.textContent = error.code === 'CHECKOUT_EXPIRED'
          ? 'O prazo desta tentativa de pagamento terminou. Você pode iniciar uma nova compra quando quiser.'
          : 'O prazo de acesso ao pedido anterior terminou. Se você já pagou, não faça outra compra apenas para recuperar o arquivo.';
        button.textContent = 'Iniciar nova compra';
        if (attempt?.orderId && UUID.test(attempt.orderId)) {
          const previousOrder = node('a', 'shop-receipt-link', 'Ver pedido anterior');
          previousOrder.href = receiptURL(attempt.orderId);
          message.append(document.createElement('br'), previousOrder);
        }
      }
      checkoutPending = false;
    }
  }
  async function selectPhoto(photoId) {
    selectedPhoto = photoId;
    const mount = getMount();
    if (!mount) return;
    mount.hidden = true;
    mount.replaceChildren();
    if (!configured || edition !== 'v1') return;
    let catalog;
    try { catalog = await getCatalog(); } catch { return; } // Offline catalogs never expose a broken buy button.
    if (selectedPhoto !== photoId) return;
    const photo = catalog.products.find(item => item.id === photoId && item.available === true);
    if (!photo) return;
    if (catalog.mode === 'test') mount.append(node('span', 'shop-test', 'Ambiente de teste · sem cobrança real'));
    mount.append(node('h3', '', 'Leve esta fotopoesia com você.'));
    mount.append(node('p', 'shop-price', money.format(photo.amount / 100)));
    mount.append(node('p', 'shop-file', `Arquivo JPEG · ${dimensions(photo)}`));
    mount.append(node('p', 'shop-license', `${photo.license}. Licença não exclusiva, com o arquivo disponível para download após a confirmação do pagamento. O acesso ao download vale por 30 dias a partir da abertura do pedido.`));
    if (catalog.mode === 'test') {
      mount.append(node('p', 'shop-test-instructions', 'Use o cartão de teste 4242 4242 4242 4242, validade futura e CVC de 3 dígitos. Não informe um cartão real. Nenhuma cobrança será feita.'));
    }
    const attempt = readStored(`attempt.${edition}.${photo.id}`);
    const completed = attempt?.orderId && readStored(`order.${attempt.orderId}`);
    if (completed?.confirmedPaid && completed.apiBase === apiBase && TOKEN.test(completed.buyerToken)) {
      const link = node('a', 'shop-button', 'Acessar minha compra');
      link.href = receiptURL(completed.orderId);
      mount.append(link);
    } else {
      const button = node('button', 'shop-button', catalog.mode === 'test' ? 'Testar compra na Stripe' : 'Comprar na Stripe');
      button.type = 'button';
      const message = node('p', 'shop-message');
      message.setAttribute('role', 'status');
      message.setAttribute('aria-live', 'polite');
      button.addEventListener('click', () => beginCheckout(photo, catalog.mode, button, message));
      mount.append(button, message);
    }
    mount.append(node('p', 'shop-note', 'O pagamento abre nesta mesma aba. Volte por ela para baixar o arquivo; o acesso fica guardado nesta sessão do navegador.'));
    mount.hidden = false;
  }

  async function initializeReturn() {
    const title = document.querySelector('#shop-order-title');
    const status = document.querySelector('#shop-order-status');
    const help = document.querySelector('#shop-order-help');
    const testBadge = document.querySelector('#shop-order-test');
    const summary = document.querySelector('#shop-order-summary');
    const retry = document.querySelector('#shop-order-retry');
    const download = document.querySelector('#shop-download');
    const downloadMessage = document.querySelector('#shop-download-message');
    const params = new URLSearchParams(location.search);
    const orderId = params.get('pedido') || '';
    const canceled = params.get('cancelado') === '1';
    const delays = [1500, 2500, 4000, 6500, 10000, 12000, 15000];
    let polling = 0;
    let timer;
    let checking = false;
    let downloading = false;
    let serverOrder;
    let order;
    const setState = (heading, message, extra = '') => {
      title.textContent = heading;
      status.textContent = message;
      help.textContent = extra;
    };
    if (!UUID.test(orderId)) {
      setState('Pedido não identificado', 'Este endereço não contém um pedido válido.', 'Abra a página de retorno do pagamento na mesma aba em que iniciou sua compra.');
      return;
    }
    document.querySelector('#shop-order-reference').hidden = false;
    document.querySelector('#shop-order-id').textContent = orderId;
    order = readStored(`order.${orderId}`);
    if (!order || !TOKEN.test(order.buyerToken) || order.orderId !== orderId) {
      setState('Acesso não encontrado nesta aba', 'Não encontramos a autorização local para consultar este pedido.', 'Volte à aba em que iniciou o pagamento e use o retorno da Stripe. O número do pedido sozinho não libera o download. Fechar a aba ou apagar os dados da sessão pode remover esse acesso. Não faça outra compra apenas para tentar recuperar este arquivo.');
      return;
    }
    const backLink = document.querySelector('#shop-back-link');
    backLink.href = new URL('./#acervo', siteRoot).href;
    testBadge.hidden = order.mode !== 'test';
    if (!configured || order.apiBase !== apiBase) {
      setState('Consulta indisponível', 'O serviço de compras não está conectado a esta versão do site.', 'Seu pedido não foi confirmado nesta página. Mantenha esta aba e tente novamente quando o serviço estiver disponível.');
      return;
    }
    const authHeaders = { Authorization: `Bearer ${order.buyerToken}` };
    function showSummary(data) {
      summary.replaceChildren();
      if (!validProduct(data.photo)) { summary.hidden = true; return; }
      summary.append(node('h2', '', data.photo.title));
      const details = node('dl');
      for (const [label, value] of [
        ['Valor', money.format(data.photo.amount / 100)],
        ['Arquivo', `JPEG · ${dimensions(data.photo)}`],
        ['Licença', `${data.photo.license} · não exclusiva`],
      ]) details.append(node('dt', '', label), node('dd', '', value));
      if (data.expiresAt && !Number.isNaN(Date.parse(data.expiresAt))) {
        details.append(node('dt', '', 'Acesso até'), node('dd', '', new Intl.DateTimeFormat('pt-BR', { dateStyle: 'long', timeZone: 'America/Sao_Paulo' }).format(new Date(data.expiresAt))));
      }
      summary.append(details);
      summary.hidden = false;
    }
    function markPaid() {
      order.confirmedPaid = true;
      try {
        writeStored(`order.${orderId}`, order);
        writeStored(`attempt.${order.edition}.${order.photoId}`, order);
      } catch { /* The already-loaded token still authorizes this page. */ }
    }
    async function checkOrder(manual = false) {
      if (checking || downloading) return;
      if (manual) polling = 0;
      window.clearTimeout(timer);
      checking = true;
      retry.disabled = true;
      retry.hidden = false;
      download.hidden = true;
      status.textContent = 'Consultando a confirmação do pagamento…';
      try {
        const data = await request(`/orders/${orderId}`, { headers: authHeaders });
        if (data.orderId !== orderId || !['test', 'live'].includes(data.mode) || data.mode !== order.mode) {
          throw new ShopError('A resposta não corresponde ao pedido desta sessão. Não foi liberado nenhum download.', 'order_response');
        }
        serverOrder = data;
        testBadge.hidden = data.mode !== 'test';
        showSummary(data);
        switch (data.status) {
          case 'paid':
            markPaid();
            if (data.downloadAvailable === true) {
              setState(data.mode === 'test' ? 'Compra de teste confirmada' : 'Pagamento confirmado', data.mode === 'test' ? 'Seu teste foi concluído, sem cobrança real. O arquivo está pronto para baixar.' : 'Seu arquivo está pronto para baixar.', 'Baixe e guarde o arquivo. O acesso ao download vale por 30 dias a partir da abertura do pedido; a data limite aparece acima. Mantenha esta aba aberta, pois o acesso também depende desta sessão do navegador.');
              download.hidden = false;
              retry.hidden = true;
            } else {
              setState('Pagamento confirmado', 'O download ainda não está disponível para este pedido.', 'Consulte novamente em alguns instantes. Não é necessário pagar outra vez.');
            }
            break;
          case 'pending':
            setState(canceled ? 'Você voltou do pagamento' : 'Aguardando confirmação', canceled
              ? 'O pagamento foi interrompido ou ainda não foi confirmado. Nenhum arquivo foi liberado.'
              : 'O serviço ainda está confirmando seu pagamento. Alguns meios de pagamento levam mais tempo.', 'Não inicie outra compra enquanto aguarda a confirmação deste pedido.');
            if (!canceled && polling < delays.length && !document.hidden) timer = window.setTimeout(() => checkOrder(), delays[polling++]);
            else if (!canceled) help.textContent = 'A consulta automática terminou. Use “Consultar novamente” para verificar mais tarde; não é necessário iniciar outra compra.';
            break;
          case 'refund_pending':
            setState('Reembolso em processamento', 'O reembolso está em análise e o download foi suspenso temporariamente.', 'Este estado ainda não confirma um reembolso concluído. Use “Consultar novamente” para acompanhar.');
            break;
          case 'refunded':
            setState('Pedido reembolsado', 'Este pedido consta como reembolsado. O download foi desativado.', 'Consulte os detalhes do reembolso no seu comprovante de pagamento.');
            retry.hidden = true;
            clearAttempt(order);
            break;
          case 'disputed':
            setState('Pagamento em contestação', 'O acesso ao arquivo está suspenso enquanto a contestação é analisada.');
            retry.hidden = true;
            break;
          case 'review':
            setState('Pedido em análise', 'Este pedido precisa de verificação antes da liberação do arquivo.', 'Consulte novamente mais tarde. Não é necessário pagar outra vez.');
            break;
          case 'expired':
            setState('Pedido expirado', 'O prazo deste pedido terminou e nenhum download está disponível.', 'Se houve cobrança, confira seu comprovante antes de iniciar outra compra.');
            retry.hidden = true;
            clearAttempt(order);
            break;
          case 'failed':
            setState('Pagamento não confirmado', 'O serviço informou uma falha neste pagamento. O arquivo não foi liberado.', 'Confira o resultado na Stripe antes de tentar uma nova compra.');
            retry.hidden = true;
            clearAttempt(order);
            break;
          default:
            setState('Pedido ainda não liberado', 'Não foi possível confirmar um estado válido para o download.', 'Tente consultar novamente. Esta tela não confirma uma cobrança.');
        }
      } catch (error) {
        if (error.code === 'ORDER_ACCESS_EXPIRED') {
          clearAttempt(order);
          retry.hidden = true;
          setState('Prazo de acesso encerrado', 'O prazo de acesso a este pedido terminou. O download não está mais disponível por esta autorização.', 'Guarde o número do pedido. Se você já pagou, não faça outra compra apenas para recuperar o arquivo. Você ainda pode voltar ao varal.');
        } else {
          setState('Não foi possível consultar', error.message, 'Tente novamente nesta mesma aba. Uma falha de conexão não significa que o pagamento falhou.');
        }
      } finally { checking = false; retry.disabled = false; }
    }
    retry.addEventListener('click', () => checkOrder(true));
    download.addEventListener('click', async () => {
      if (downloading || serverOrder?.status !== 'paid' || serverOrder.downloadAvailable !== true) return;
      downloading = true;
      download.disabled = true;
      download.textContent = 'Preparando arquivo…';
      downloadMessage.hidden = false;
      downloadMessage.dataset.error = 'false';
      downloadMessage.textContent = 'Aguarde o download do JPEG.';
      try {
        const response = await request(`/orders/${orderId}/download`, { method: 'POST', headers: authHeaders }, true);
        if (!response.headers.get('Content-Type')?.toLowerCase().startsWith('image/jpeg')) throw new ShopError('O arquivo recebido não é um JPEG válido. Consulte o pedido novamente.', 'file_type');
        const blob = await response.blob();
        if (!blob.size) throw new ShopError('O arquivo veio vazio. Tente baixar novamente.', 'empty_file');
        const safeId = String(serverOrder.photo?.id || 'fotopoesia').replace(/[^a-z0-9_-]/gi, '-');
        const objectURL = URL.createObjectURL(blob);
        const anchor = node('a');
        anchor.href = objectURL;
        anchor.download = `fotocordel-${safeId}.jpg`;
        document.body.append(anchor);
        anchor.click();
        anchor.remove();
        window.setTimeout(() => URL.revokeObjectURL(objectURL), 60000);
        downloadMessage.textContent = 'O arquivo foi enviado ao navegador. Confira sua pasta de downloads.';
      } catch (error) {
        downloadMessage.dataset.error = 'true';
        downloadMessage.textContent = error.message;
        retry.hidden = false;
      } finally { downloading = false; download.disabled = false; download.textContent = 'Baixar arquivo JPEG'; }
    });
    window.addEventListener('pagehide', () => window.clearTimeout(timer));
    await checkOrder();
  }

  window.FotocordelShop = Object.freeze({ selectPhoto });
  if (isReturn) initializeReturn();
  else getMount();
})();
