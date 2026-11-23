'use client';
import { useState } from 'react';

export default function LoginPage() {
  const [message, setMessage] = useState('');

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const res = await fetch('/api/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ username: form.get('username'), password: form.get('password') }),
    });
    if (!res.ok) {
      setMessage('로그인 실패');
      return;
    }
    const data = await res.json();
    window.location.href = data.role === 'admin' ? '/admin' : '/enrollments';
  }

  return (
    <main>
      <h1>로그인</h1>
      <form onSubmit={onSubmit}>
        <p><input name="username" placeholder="아이디" required /></p>
        <p><input name="password" type="password" placeholder="비밀번호" required /></p>
        <button type="submit">로그인</button>
      </form>
      <p>{message}</p>
      <p>데모 계정은 README를 참고하세요.</p>
    </main>
  );
}
