// Referência global do client Discord — usada em módulos que não recebem o client por parâmetro
let _client = null;

function setClient(client) { _client = client; }
function getClient() { return _client; }

module.exports = { setClient, getClient };
