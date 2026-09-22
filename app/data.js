/* Dados inteiramente fictícios. O estado de demonstração é armazenado localmente. */
window.GiroData = (() => {
  const statuses = [
    { name: 'Entrada', color: '#9CA3AF', short: 'Entrada' },
    { name: 'Diagnóstico', color: '#60A5FA', short: 'Diagnóstico' },
    { name: 'Aguardando aprovação', color: '#2DD4BF', short: 'Aprovação' },
    { name: 'Aguardando peças', color: '#B497ED', short: 'Peças' },
    { name: 'Em serviço', color: '#38BDF8', short: 'Em serviço' },
    { name: 'Finalização', color: '#67CDE0', short: 'Finalização' },
    { name: 'Pronto', color: '#4ADE80', short: 'Pronto' }
  ];
  const clients = [
    { id: 1, name: 'João Silva', phone: '(51) 99912-3487', email: 'joao.silva@example.com' },
    { id: 2, name: 'Ana Souza', phone: '(51) 99834-2156', email: 'ana.souza@example.com' }
  ];
  const vehicles = [
    { id: 1, brand: 'Toyota', model: 'Corolla XEi 2.0', year: 2021, plate: 'ABC1D23', km: 82430, client: 1, next: 'Troca de óleo · 90.000 km' },
    { id: 3, brand: 'Chevrolet', model: 'Onix LT 1.0', year: 2022, plate: 'XYZ9H87', km: 38900, client: 2, next: 'Troca de óleo · 40.000 km' }
  ];
  const team = [
    { id: 1, name: 'Marcos Ribeiro', role: 'Mecânico', specialty: 'Freios e suspensão', color: 'blue' },
    { id: 3, name: 'André Costa', role: 'Mecânico', specialty: 'Elétrica e diagnóstico', color: 'purple' }
  ];
  const orders = [
    { id: 1048, vehicle: 1, service: 'Pastilhas dianteiras + revisão dos freios', status: 4, mechanic: 1, value: 1280, priority: 'Alta', elapsed: '2h 35min', due: 'Hoje, 17:00', entry: '14/09', issue: 'Cliente relatou ruído durante a frenagem.', diagnosis: 'Pastilhas dianteiras com desgaste acentuado. Discos dentro da tolerância.', late: false },
    { id: 1049, vehicle: 3, service: 'Diagnóstico de ruído na suspensão', status: 0, mechanic: 3, value: 280, priority: 'Normal', elapsed: '25min', due: 'Hoje, 18:00', entry: '15/09', issue: 'Barulho na suspensão ao passar em irregularidades.' }
  ].map(o => ({ ...o, notes: [], photos: [], extraServices: [], paused: false, history: [{ text: 'Veículo recebido na oficina', date: `${o.entry}/2026 · 08:30` }] }));
  const conversations = [
    { id: 1, client: 1, vehicle: 1, unread: 2, availability: 'Amanhã pela manhã', problem: 'Ruído ao frear', messages: [
      { who: 'client', text: 'Bom dia! Meu Corolla está fazendo um barulho quando freio. Vocês conseguem dar uma olhada?', time: '09:12' },
      { who: 'bot', text: 'Olá, João! Claro, vamos cuidar disso. Você pode me informar a placa e quando consegue trazer o veículo?', time: '09:12' },
      { who: 'client', text: 'ABC1D23. Consigo amanhã pela manhã.', time: '09:14' },
      { who: 'bot', text: 'Perfeito! Já anotei as informações. Nossa equipe vai continuar seu atendimento.', time: '09:14' },
      { who: 'attendant', text: 'Oi, João! Aqui é o Marcos. Temos um horário às 8h30. Pode ser?', time: '09:18' },
      { who: 'client', text: 'Pode sim! Muito obrigado 👍', time: '09:20' }
    ] },
    { id: 2, client: 2, vehicle: 3, unread: 1, availability: 'Hoje à tarde', problem: 'Barulho na suspensão', messages: [{ who: 'client', text: 'Olá! Meu Onix está fazendo um barulho na suspensão. Posso levar hoje?', time: '10:42' }] }
  ];
  const seed = () => JSON.parse(JSON.stringify({ clients, vehicles, team, orders, conversations, settings: { workshop: 'Auto Center Garage', name: 'Carlos Almeida', email: 'carlos@example.com', phone: '(51) 3333-4455', address: 'Av. Assis Brasil, 1450 · Porto Alegre, RS', notifications: true }, readNotifications: false }));
  return { statuses, seed };
})();
