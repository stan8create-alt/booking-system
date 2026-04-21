exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method Not Allowed' };

  const { username, password } = JSON.parse(event.body);
  const validUser = process.env.ADMIN_USERNAME || 'login';
  const validPass = process.env.ADMIN_PASSWORD || 'password';

  if (username === validUser && password === validPass) {
    const token = Buffer.from(`${username}:${password}`).toString('base64');
    return { statusCode: 200, body: JSON.stringify({ token }) };
  }
  return { statusCode: 401, body: JSON.stringify({ error: 'Invalid credentials' }) };
};
