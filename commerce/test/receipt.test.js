import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Script, createContext } from 'node:vm';

const shop = new Script(readFileSync(new URL('../../shop.js', import.meta.url), 'utf8'), { filename: 'shop.js' });
const pages = {
  v1: readFileSync(new URL('../../compra.html', import.meta.url), 'utf8'),
  v2: readFileSync(new URL('../../v2/compra.html', import.meta.url), 'utf8'),
};
const API = 'https://api.fotocordel.example';
const ORDER_ID = 'd704a822-f9b5-41dc-b6b3-ec8d53c2dc53';
const REQUEST_ID = 'b8bb72c9-c695-4c43-b8a4-41dfaf2e2c46';
const BUYER_TOKEN = 'a7'.repeat(32); // Synthetic fixture; never reads a browser's real storage.
const ORDER_KEY = `fotocordel.shop.order.${ORDER_ID}`;

function attributes(markup) {
  return new Map([...markup.matchAll(/([\w-]+)(?:="([^"]*)")?/g)].map(([, name, value]) => [name, value ?? '']));
}

// Only the DOM surface used by the receipt. Initial IDs, hrefs and hidden states
// come from the actual HTML, so missing markup cannot be masked by the fixture.
class Element {
  constructor(markup = '', pageURL) {
    this.attributes = attributes(markup);
    this.pageURL = pageURL;
    this.hidden = this.attributes.has('hidden');
    this.disabled = this.attributes.has('disabled');
    this.dataset = {};
    this.children = [];
    this.listeners = new Map();
    this.textContent = '';
    this.hrefValue = this.attributes.get('href') || '';
  }
  get href() { return this.hrefValue ? new URL(this.hrefValue, this.pageURL).href : ''; }
  set href(value) { this.hrefValue = String(value); }
  hasAttribute(name) { return this.attributes.has(name); }
  setAttribute(name, value) { this.attributes.set(name, String(value)); }
  append(...children) { this.children.push(...children); }
  replaceChildren(...children) { this.children = children; }
  addEventListener(name, listener) { this.listeners.set(name, listener); }
}

async function openReceipt({
  page = 'v1', root = 'https://fotocordel-preview.example/',
  query = '', storedEdition = page, apiEdition = page, token = true,
  status = 'paid', downloadAvailable = true,
} = {}) {
  const siteURL = new URL(root);
  const pageURL = new URL(page === 'v2' ? 'v2/compra.html' : 'compra.html', siteURL);
  pageURL.search = `?pedido=${ORDER_ID}${query}`;
  const html = pages[page];
  const elements = new Map();
  for (const [, markup] of html.matchAll(/<[a-z][\w-]*\b([^<>]*\bid="[^"]+"[^<>]*)>/gi)) {
    const element = new Element(markup, pageURL);
    elements.set(`#${element.attributes.get('id')}`, element);
  }
  assert.ok(elements.has('#shop-brand-link'), `Receipt brand missing: ${[...elements.keys()].join(', ')}`);
  const body = new Element(html.match(/<body\b([^>]*)>/i)[1], pageURL);
  const scriptSrc = [...html.matchAll(/<script\b[^>]*src="([^"]+)"/gi)]
    .map(([, src]) => src).find(src => new URL(src, pageURL).pathname.endsWith('/shop.js'));
  assert.ok(scriptSrc, 'Receipt must load the shared storefront script');
  const storedOrder = {
    orderId: ORDER_ID, requestId: REQUEST_ID, buyerToken: BUYER_TOKEN,
    photoId: '12-jangada', edition: storedEdition, apiBase: API,
    mode: 'test', createdAt: '2026-10-22T12:00:00Z',
  };
  const storage = new Map(token ? [[ORDER_KEY, JSON.stringify(storedOrder)]] : []);
  const beforeStorage = [...storage];
  const mutations = [];
  const requests = [];
  const navigations = [];
  const timers = new Map();
  let nextTimer = 0;
  const apiOrder = {
    orderId: ORDER_ID, edition: apiEdition, mode: 'test', status, downloadAvailable,
    expiresAt: '2026-11-21T12:00:00Z',
    photo: { id: '12-jangada', title: 'Jangada', amount: 999, currency: 'brl',
      width: 1024, height: 640, license: 'Uso pessoal e comercial' },
  };
  const context = createContext({
    URL, URLSearchParams, AbortController, Intl, Date,
    FOTOCORDEL_SHOP_CONFIG: { enabled: true, apiBase: API },
    document: {
      body, hidden: false, currentScript: { src: new URL(scriptSrc, pageURL).href },
      querySelector: selector => elements.get(selector)
        || (selector.startsWith('.') ? [...elements.values()].find(element =>
          (element.attributes.get('class') || '').split(/\s+/).includes(selector.slice(1))) : null) || null,
      createElement: () => new Element('', pageURL),
    },
    location: {
      href: pageURL.href, hostname: pageURL.hostname, pathname: pageURL.pathname, search: pageURL.search,
      replace: url => navigations.push({ method: 'replace', url }),
      assign: url => navigations.push({ method: 'assign', url }),
    },
    sessionStorage: {
      getItem: key => storage.get(key) ?? null,
      setItem: (key, value) => { mutations.push(['set', key]); storage.set(key, value); },
      removeItem: key => { mutations.push(['remove', key]); storage.delete(key); },
    },
    fetch: async (url, options) => {
      requests.push({ url, options });
      assert.equal(url, `${API}/orders/${ORDER_ID}`, 'Receipt must only consult its order');
      return new Response(JSON.stringify(apiOrder), { headers: { 'Content-Type': 'application/json' } });
    },
    setTimeout: (callback, delay) => { const id = ++nextTimer; timers.set(id, { callback, delay }); return id; },
    clearTimeout: id => timers.delete(id),
    addEventListener() {},
  });
  context.window = context;
  shop.runInContext(context);
  // The real startup awaits fetch and response.json; drain those jobs without
  // running polling timers or inserting hooks into production code.
  await new Promise(resolve => setImmediate(resolve));
  return { elements, requests, navigations, storage, beforeStorage, mutations, siteURL };
}

function authenticatedLookup(result) {
  assert.equal(result.requests.length, 1);
  const { options } = result.requests[0];
  assert.equal(options.headers.Authorization, `Bearer ${BUYER_TOKEN}`);
  assert.equal(options.credentials, 'omit');
  assert.equal(options.redirect, 'error');
}

test('legacy root receipt follows authenticated V2 edition and preserves cancellation on the same origin', async () => {
  const result = await openReceipt({
    root: 'https://legacy.example/fotocordel/', page: 'v1',
    storedEdition: 'v1', apiEdition: 'v2', query: '&cancelado=1&edition=v1',
  });
  authenticatedLookup(result);
  assert.deepEqual(result.navigations, [{ method: 'replace',
    url: `https://legacy.example/fotocordel/v2/compra.html?pedido=${ORDER_ID}&cancelado=1` }]);
  assert.equal(result.elements.get('#shop-download').hidden, true);
  assert.deepEqual([...result.storage], result.beforeStorage);
  assert.deepEqual(result.mutations, []);
});

test('V2 receipt sends a V1 order to the root despite stale storage and edition query', async () => {
  const result = await openReceipt({ page: 'v2', storedEdition: 'v2', apiEdition: 'v1', query: '&edition=v2' });
  authenticatedLookup(result);
  assert.deepEqual(result.navigations, [{ method: 'replace',
    url: `https://fotocordel-preview.example/compra.html?pedido=${ORDER_ID}` }]);
  assert.equal(result.elements.get('#shop-download').hidden, true);
  assert.deepEqual([...result.storage], result.beforeStorage);
  assert.deepEqual(result.mutations, []);
});

for (const page of ['v1', 'v2']) {
  test(`${page} receipt without a token neither redirects nor confirms a query-string payment`, async () => {
    const result = await openReceipt({ page, token: false, query: '&edition=v2&status=paid&cancelado=1' });
    assert.equal(result.requests.length, 0);
    assert.deepEqual(result.navigations, []);
    assert.deepEqual(result.mutations, []);
    assert.equal(result.elements.get('#shop-download').hidden, true);
    assert.equal(result.elements.get('#shop-order-summary').hidden, true);
    assert.match(result.elements.get('#shop-order-title').textContent, /Acesso não encontrado/);
  });

  test(`paid ${page} receipt keeps both links in its edition and retains the original access token`, async () => {
    const other = page === 'v1' ? 'v2' : 'v1';
    const result = await openReceipt({
      page, root: 'https://legacy.example/fotocordel/',
      apiEdition: page, storedEdition: other, query: `&edition=${other}`,
    });
    authenticatedLookup(result);
    assert.deepEqual(result.navigations, []);
    const expectedRoot = page === 'v2'
      ? 'https://legacy.example/fotocordel/v2/' : 'https://legacy.example/fotocordel/';
    assert.equal(result.elements.get('#shop-brand-link').href, expectedRoot);
    assert.equal(result.elements.get('#shop-back-link').href, `${expectedRoot}#acervo`);
    assert.equal(result.elements.get('#shop-download').hidden, false);
    assert.equal(result.elements.get('#shop-order-summary').hidden, false);
    assert.equal(result.elements.get('#shop-order-test').hidden, false);
    assert.match(result.elements.get('#shop-order-title').textContent, /Compra de teste confirmada/);
    const saved = JSON.parse(result.storage.get(ORDER_KEY));
    assert.equal(saved.edition, page, 'Authenticated order corrects stale edition metadata');
    assert.equal(saved.confirmedPaid, true);
    assert.equal(saved.buyerToken, BUYER_TOKEN);
    assert.equal(saved.requestId, REQUEST_ID);
    assert.equal(saved.orderId, ORDER_ID);
    assert.equal(result.mutations.some(([action]) => action === 'remove'), false);
    for (const value of result.storage.values()) assert.equal(JSON.parse(value).buyerToken, BUYER_TOKEN);
  });
}

test('query-string paid state cannot override a pending order', async () => {
  const result = await openReceipt({ status: 'pending', downloadAvailable: false, query: '&status=paid&cancelado=1' });
  authenticatedLookup(result);
  assert.deepEqual(result.navigations, []);
  assert.equal(result.elements.get('#shop-download').hidden, true);
  assert.match(result.elements.get('#shop-order-title').textContent, /Você voltou do pagamento/);
  assert.deepEqual([...result.storage], result.beforeStorage);
});

test('invalid API edition cannot select a destination or release a paid download', async () => {
  const result = await openReceipt({ apiEdition: 'https://outside.example/', query: '&edition=v2' });
  authenticatedLookup(result);
  assert.deepEqual(result.navigations, []);
  assert.equal(result.elements.get('#shop-download').hidden, true);
  assert.match(result.elements.get('#shop-order-status').textContent, /resposta não corresponde/);
  assert.deepEqual([...result.storage], result.beforeStorage);
});
