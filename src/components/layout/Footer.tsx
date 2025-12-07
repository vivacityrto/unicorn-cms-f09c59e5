export default function Footer() {
  return (
    <footer className="w-full bg-card border-t mt-auto py-4 text-center text-sm text-muted-foreground">
      <p>
        © {new Date().getFullYear()} Vivacity Coaching & Consulting |{' '}
        <a 
          href="https://vivacity.com.au" 
          target="_blank" 
          rel="noopener noreferrer"
          className="text-primary hover:underline"
        >
          vivacity.com.au
        </a>
        {' '} | Support:{' '}
        <a 
          href="mailto:support@vivacity.com.au" 
          className="text-primary hover:underline"
        >
          support@vivacity.com.au
        </a>
        {' '} | Phone:{' '}
        <a 
          href="tel:1300729455" 
          className="text-primary hover:underline"
        >
          1300 729 455
        </a>
      </p>
    </footer>
  );
}
