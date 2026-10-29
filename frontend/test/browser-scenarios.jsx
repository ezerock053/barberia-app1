import React from 'react';
import { createRoot } from 'react-dom/client';
import 'bootstrap/dist/css/bootstrap.min.css';
import '../src/style.css';
import MyAgendaPage from '../src/admin/MyAgendaPage.jsx';
import AppointmentsPage from '../src/admin/AppointmentsPage.jsx';
import SchedulesPage from '../src/admin/SchedulesPage.jsx';
import BookingPage from '../src/pages/BookingPage.jsx';

const RealDate = Date;
globalThis.Date = class extends RealDate {
  constructor(...args) { super(...(args.length ? args : ['2026-10-29T12:00:00Z'])); }
  static now() { return RealDate.parse('2026-10-29T12:00:00Z'); }
};
const host = document.getElementById('root');
const root = createRoot(host);
let mountId = 0;
const pause = (ms = 15) => new Promise((resolve) => setTimeout(resolve, ms));
const check = (condition, message) => { if (!condition) throw new Error(message); };
async function waitFor(predicate, description) {
  for (let i = 0; i < 150; i++) { if (predicate()) return; await pause(); }
  throw new Error(`Tiempo agotado: ${description}`);
}
const text = () => host.textContent;
const button = (label) => [...host.querySelectorAll('button')].find((element) => element.textContent.trim() === label);
async function click(label) { await waitFor(() => button(label) && !button(label).disabled, label); button(label).click(); await pause(); }
function change(element, value) {
  const prototype = element.tagName === 'SELECT' ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(prototype, 'value').set.call(element, value);
  element.dispatchEvent(new Event('input', { bubbles: true }));
  element.dispatchEvent(new Event('change', { bubbles: true }));
}
const response = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json' } });
const staff = [{ id: 1, name: 'Ana', active: true }, { id: 2, name: 'Bruno', active: true }];
const appointment = (id, extra = {}) => ({ id, startAt: '2026-10-29T13:00:00Z', serviceName: 'Corte', servicePrice: '1000.00',
  status: 'pending', paymentStatus: 'pending', customer: { name: `Cliente ${id}` }, barber: staff[0], ...extra });
function mobileButton(element) { check(element.getBoundingClientRect().height >= 43, 'Área táctil menor a 44px'); }
function noOverflow() { check(document.documentElement.scrollWidth <= window.innerWidth + 1, 'Desborde horizontal de la página'); }
async function mount(Component) { root.render(<Component key={++mountId} />); await pause(); }

const results = [];
function publish(result) {
  document.getElementById('result').textContent = JSON.stringify(result);
  window.parent.postMessage(result, window.location.origin);
}
async function scenario(name, run) { await run(); results.push(name); }
async function run() {
  await scenario('Agenda: actualizar, error, reintento, próximo y observaciones seguras', async () => {
    let calls = 0;
    globalThis.fetch = async () => {
      calls++;
      return calls === 2 ? response({ error: 'Sin conexión de prueba' }, 503) : response([
        appointment(1, { notes: '<img src=x onerror="window.noteExecuted=true">\nTexto del cliente' }),
        appointment(2, { status: 'completed', startAt: '2026-10-29T12:30:00Z' }),
      ]);
    };
    await mount(MyAgendaPage);
    await waitFor(() => text().includes('Cliente 1'), 'agenda');
    check(host.querySelectorAll('.appointment-next').length === 1, 'Debe haber un único próximo');
    check(host.querySelector('.appointment-next').textContent.includes('Cliente 1'), 'Próximo incorrecto');
    check(Boolean(button('Finalizar y cobrar')), 'Se perdió la acción rápida');
    mobileButton(button('Actualizar')); noOverflow();
    host.querySelector('summary').click();
    check(host.querySelector('.appointment-notes').textContent.includes('<img'), 'Observaciones no visibles');
    check(!host.querySelector('.appointment-notes img') && !window.noteExecuted, 'Se interpretaron observaciones como HTML');
    await click('Actualizar');
    await waitFor(() => text().includes('Sin conexión de prueba'), 'error agenda');
    check(!host.querySelector('.appointment-card'), 'Agenda conserva tarjetas tras error');
    mobileButton(button('Reintentar'));
    await click('Reintentar');
    await waitFor(() => text().includes('Cliente 1'), 'reintento agenda');
    check(calls === 3, 'Actualizar no volvió a consultar la misma fecha');
    await click('Finalizar y cobrar');
    check(Boolean(button('Efectivo')) && Boolean(button('Transferencia')), 'Falta selección de cobro');
    mobileButton(button('Transferencia')); noOverflow();
  });
  await scenario('Turnos: un filtro fallido no muestra tarjetas de la fecha anterior', async () => {
    let calls = 0;
    globalThis.fetch = async (url) => String(url).includes('/barbers') ? response(staff)
      : ++calls === 1 ? response([appointment(10)]) : response({ error: 'Fallo de la nueva fecha' }, 503);
    await mount(AppointmentsPage);
    await waitFor(() => text().includes('Cliente 10'), 'turnos iniciales');
    change(host.querySelector('input[type=date]'), '2026-10-30');
    await waitFor(() => text().includes('Fallo de la nueva fecha'), 'error de nuevo filtro');
    check(!host.querySelector('.appointment-card'), 'Se conservaron tarjetas del filtro anterior');
    check(!text().includes('No hay turnos que coincidan'), 'Error confundido con lista vacía');
  });
  await scenario('Horarios: respuesta anterior tardía no reemplaza al profesional seleccionado', async () => {
    let resolveFirst;
    globalThis.fetch = async (url) => {
      if (String(url).endsWith('/barbers?includeInactive=true')) return response(staff);
      if (String(url).includes('/barbers/1/')) return new Promise((resolve) => { resolveFirst = resolve; });
      return response([{ id: 2, dayOfWeek: 2, startTime: '14:00:00', endTime: '18:00:00' }]);
    };
    await mount(SchedulesPage);
    await waitFor(() => resolveFirst && host.querySelector('select'), 'consulta Ana pendiente');
    change(host.querySelector('select'), '2');
    await waitFor(() => text().includes('14:00'), 'horarios Bruno');
    resolveFirst(response([{ id: 1, dayOfWeek: 1, startTime: '09:00:00', endTime: '10:00:00' }]));
    await pause(60);
    check(text().includes('14:00') && !text().includes('09:00'), 'Respuesta de Ana sobrescribió Bruno');
    check(host.querySelector('select').value === '2', 'Se cambió el profesional');
  });
  await scenario('Reserva: error de horarios, reintento, vacío y selección sin datos obsoletos', async () => {
    let calls = 0; let resolveOld;
    globalThis.fetch = async (url) => {
      if (String(url).endsWith('/services')) return response([{ id: 1, name: 'Corte', price: '1000.00' }]);
      if (String(url).endsWith('/barbers')) return response(staff);
      if (++calls === 1) return response({ error: 'Sin red' }, 503);
      if (calls === 2) return response({ availableSlots: [], slotStartsAt: {} });
      if (calls === 3) return new Promise((resolve) => { resolveOld = resolve; });
      return response({ availableSlots: ['11:00'], slotStartsAt: { '11:00': '2026-10-31T14:00:00.000Z' } });
    };
    await mount(BookingPage);
    await waitFor(() => host.querySelector('#service-1'), 'servicios');
    host.querySelector('#service-1').click(); await click('Continuar');
    host.querySelector('#barber-1').click(); await click('Continuar');
    check(text().includes('al menos dos horas'), 'Falta anticipación mínima');
    change(host.querySelector('input[type=date]'), '2026-10-29');
    await waitFor(() => text().includes('No se pudieron cargar los horarios'), 'error disponibilidad');
    check(!text().includes('No hay horarios disponibles'), 'Fallo de red confundido con día vacío');
    mobileButton(button('Reintentar')); noOverflow();
    await click('Reintentar');
    await waitFor(() => text().includes('No hay horarios disponibles'), 'día sin horarios');
    check(!text().includes('No se pudieron cargar los horarios'), 'Error no se limpió al reintentar');
    change(host.querySelector('input[type=date]'), '2026-10-30');
    await waitFor(() => resolveOld, 'disponibilidad anterior pendiente');
    change(host.querySelector('input[type=date]'), '2026-10-31');
    await waitFor(() => button('11:00'), 'disponibilidad más reciente');
    resolveOld(response({ availableSlots: ['10:00'], slotStartsAt: { '10:00': '2026-10-30T13:00:00.000Z' } }));
    await pause(60);
    check(!button('10:00') && Boolean(button('11:00')), 'Se usó disponibilidad de la fecha anterior');
    await click('11:00');
    check(!button('Continuar').disabled, 'No permite continuar con el horario vigente'); noOverflow();
  });
  await scenario('Reserva: reintenta la carga inicial de servicios y barberos', async () => {
    let fail = true;
    globalThis.fetch = async (url) => fail ? response({ error: 'Sin red' }, 503)
      : String(url).endsWith('/services') ? response([{ id: 1, name: 'Corte recuperado', price: '1000.00' }]) : response(staff);
    await mount(BookingPage);
    await waitFor(() => text().includes('No se pudieron cargar los servicios'), 'error catálogo');
    check(!text().includes('no hay servicios disponibles'), 'Error confundido con catálogo vacío');
    fail = false; await click('Reintentar');
    await waitFor(() => text().includes('Corte recuperado'), 'reintento catálogo');
  });
  root.unmount();
  publish({ passed: true, viewport: window.innerWidth, scenarios: results });
}
run().catch((error) => publish({ passed: false, error: error.message, scenarios: results }));
