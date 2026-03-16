async function wrappedFetch(...args) {
  const response = await fetch(...args);
  if (typeof response.buffer !== 'function') {
    response.buffer = async () => Buffer.from(await response.arrayBuffer());
  }
  return response;
}

module.exports = wrappedFetch;
module.exports.default = wrappedFetch;
