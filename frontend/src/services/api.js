const API_BASE = import.meta.env.VITE_API_URL || '/api';
let onAdminUnauthorized = null;

export function setAdminUnauthorizedHandler(handler) {
  onAdminUnauthorized = handler;
}

export class ApiError extends Error {
  constructor(status, message) {
    super(message || 'No se pudo completar la solicitud.');
    this.name = 'ApiError';
    this.status = status;
  }
}

async function request(path, options = {}, { admin = false } = {}) {
  let response;
  try {
    response = await fetch(`${API_BASE}${path}`, {
      ...options,
      credentials: 'include',
      headers: { ...(options.body ? { 'Content-Type': 'application/json' } : {}), ...options.headers },
    });
  } catch {
    throw new ApiError(0, 'No pudimos conectar con el servidor. Revisá tu conexión e intentá nuevamente.');
  }

  let data;
  try {
    data = await response.json();
  } catch {
    data = null;
  }
  if (!response.ok) {
    const error = new ApiError(response.status, data?.error || data?.message);
    if (admin && response.status === 401) onAdminUnauthorized?.();
    throw error;
  }
  return data;
}

const post = (path, body, options) => request(path, { method: 'POST', body: JSON.stringify(body) }, options);
const put = (path, body, options) => request(path, { method: 'PUT', body: JSON.stringify(body) }, options);
const remove = (path, options) => request(path, { method: 'DELETE' }, options);

export const getServices = () => request('/services');
export const getBarbers = () => request('/barbers');
export const loginAdmin = (credentials) => post('/auth/login', credentials);
export const logoutAdmin = () => post('/auth/logout', {});
export const getAdminSession = () => request('/auth/me', {}, { admin: true });
export const getAdminServices = () => request('/services?includeInactive=true', {}, { admin: true });
export const getAdminBarbers = () => request('/barbers?includeInactive=true', {}, { admin: true });
export const getAvailability = (barberId, date) =>
  request(`/availability?barberId=${encodeURIComponent(barberId)}&date=${encodeURIComponent(date)}`);
export const createCustomer = (customer) => post('/customers', customer);
export const createAppointment = (appointment) => post('/appointments', appointment);
export const getAppointments = (filters = {}) => {
  const params = new URLSearchParams();
  Object.entries(filters).forEach(([key, value]) => {
    if (value !== '' && value !== null && value !== undefined) params.set(key, value);
  });
  const query = params.toString();
  return request(`/appointments${query ? `?${query}` : ''}`, {}, { admin: true });
};
export const updateAppointment = (id, updates) => put(`/appointments/${id}`, updates, { admin: true });
export const createService = (service) => post('/services', service, { admin: true });
export const updateService = (id, updates) => put(`/services/${id}`, updates, { admin: true });
export const createBarber = (barber) => post('/barbers', barber, { admin: true });
export const updateBarber = (id, updates) => put(`/barbers/${id}`, updates, { admin: true });
export const getBarberSchedules = (barberId) => request(`/barbers/${barberId}/schedules`, {}, { admin: true });
export const createBarberSchedule = (barberId, schedule) => post(`/barbers/${barberId}/schedules`, schedule, { admin: true });
export const updateBarberSchedule = (barberId, id, schedule) => put(`/barbers/${barberId}/schedules/${id}`, schedule, { admin: true });
export const deleteBarberSchedule = (barberId, id) => remove(`/barbers/${barberId}/schedules/${id}`, { admin: true });
