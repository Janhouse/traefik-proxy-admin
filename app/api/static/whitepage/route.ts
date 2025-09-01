export async function GET() {
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Domain Available</title>
    <style>
        body {
            margin: 0;
            padding: 0;
            background-color: #ffffff;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
            display: flex;
            justify-content: center;
            align-items: center;
            min-height: 100vh;
        }
        .container {
            text-align: center;
            color: #666;
        }
        h1 {
            font-size: 2rem;
            font-weight: 300;
            margin-bottom: 1rem;
        }
        p {
            font-size: 1rem;
            line-height: 1.5;
        }
    </style>
</head>
<body>
    <div class="container">
        <h1>Domain Available</h1>
        <p>This domain is configured but no specific service is running.</p>
    </div>
</body>
</html>`;

  return new Response(html, {
    status: 200,
    headers: {
      'Content-Type': 'text/html',
      'Cache-Control': 'public, max-age=3600',
    },
  });
}