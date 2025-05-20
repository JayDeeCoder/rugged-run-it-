import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-black text-white p-4">
      <h1 className="text-4xl font-bold mb-4">404 - Page Not Found</h1>
      <p className="text-xl mb-8">Sorry, the page you are looking for does not exist.</p>
      <Link href="/" className="px-4 py-2 bg-green-600 hover:bg-green-700 rounded text-white transition-colors">
        Return Home
      </Link>
    </div>
  );
}