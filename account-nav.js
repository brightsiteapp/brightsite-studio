// Account icon in the site header: links to the admin dashboard if admin
// session is active, the customer dashboard if logged in, otherwise login.
document.addEventListener('DOMContentLoaded', () => {
  const link = document.getElementById('accountLink');
  if (!link) return;

  let isAdmin = false;
  let loggedIn = false;

  try {
    const adminSession = JSON.parse(localStorage.getItem('bs_admin') || 'null');
    isAdmin = !!(adminSession && adminSession.admin);
  } catch (e) {}

  try {
    const session = JSON.parse(localStorage.getItem('bs_session') || 'null');
    loggedIn = !!(session && session.access_token);
  } catch (e) {}

  if (isAdmin) {
    link.href = '/account/admin.html';
    link.setAttribute('aria-label', 'Admin dashboard');
    link.title = 'Admin dashboard';
  } else if (loggedIn) {
    link.href = '/account/dashboard.html';
    link.setAttribute('aria-label', 'My account');
    link.title = 'My account';
  } else {
    link.href = '/account/login.html?signup=1';
    link.setAttribute('aria-label', 'Create an account');
    link.title = 'Create an account';
  }
});
