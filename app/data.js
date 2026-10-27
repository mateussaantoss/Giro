/* Estado inicial vazio, armazenado localmente neste navegador. */
window.GiroData = (() => {
  const statuses = [
    { name: 'Entrada', color: '#60A5FA', short: 'Entrada' },
    { name: 'Aguardando peças', color: '#B497ED', short: 'Peças' },
    { name: 'Pronto', color: '#4ADE80', short: 'Pronto' }
  ];
  const emptyState = (user = {}) => ({ statusVersion: 2, clients: [], vehicles: [], team: [], orders: [], conversations: [], settings: { workshop: user.workshop || '', name: user.name || '', email: user.email || '', phone: user.phone || '', address: user.address || '', notifications: true }, readNotifications: false });
  return { statuses, emptyState };
})();
