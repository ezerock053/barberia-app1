export function appointmentWorkflow(appointment) {
  const operable = ['pending', 'confirmed', 'completed'].includes(appointment.status);
  const completed = appointment.status === 'completed';
  const paid = appointment.paymentStatus === 'paid' || Boolean(appointment.charge);
  const checkoutPending = !paid && Boolean(appointment.checkoutStarted) && appointment.paymentStatus !== 'cancelled';
  const canComplete = operable && !completed;
  const canCollect = operable && !paid && !checkoutPending;
  const primary = canComplete && canCollect ? 'combined' : canCollect ? 'charge' : canComplete ? 'complete' : null;
  const primaryLabel = primary === 'combined' ? 'Finalizar y cobrar' : primary === 'charge' ? 'Cobrar' : paid ? 'Finalizar' : 'Solo marcar realizado';
  return { operable, completed, paid, checkoutPending, canComplete, canCollect, primary, primaryLabel };
}
