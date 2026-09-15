// Account icon in the site header: links to the dashboard if logged in,
// otherwise to the login page. Shared by every page with a .top header.
document.addEventListener('DOMContentLoaded', () => {
  const link = document.getElementById('accountLink');
  if (!link) return;

  let loggedIn = false;
  try {
    const session = JSON.parse(localStorage.getItem('bs_session') || 'null');
    loggedIn = !!(session && session.access_token);
  } catch (e) {}

  link.href = loggedIn ? '/account/dashboard.html' : '/account/login.html?signup=1';
  link.setAttribute('aria-label', loggedIn ? 'My account' : 'Create an account');
  link.title = loggedIn ? 'My account' : 'Create an account';
});
