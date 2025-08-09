document.addEventListener('DOMContentLoaded', () => {
    const form = document.getElementById('webhookForm');
    const resultDiv = document.getElementById('result');
    const errorDiv = document.getElementById('error');
    const proxyUrlInput = document.getElementById('proxyUrl');
    const copyButton = document.getElementById('copyButton');

    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        resultDiv.classList.add('hidden');
        errorDiv.classList.add('hidden');
        const webhookUrl = document.getElementById('webhookUrl').value;
        const submitButton = form.querySelector('button');
        submitButton.disabled = true;
        submitButton.textContent = 'Processing...';

        try {
            const response = await fetch('/api/create', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ webhookUrl })
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error || 'An unknown error occurred.');
            }

            proxyUrlInput.value = data.proxyUrl;
            resultDiv.classList.remove('hidden');
        } catch (err) {
            errorDiv.textContent = err.message;
            errorDiv.classList.remove('hidden');
        } finally {
            submitButton.disabled = false;
            submitButton.textContent = 'Protect My Webhook';
        }
    });

    copyButton.addEventListener('click', () => {
        proxyUrlInput.select();
        document.execCommand('copy');
        copyButton.textContent = 'Copied!';
        setTimeout(() => {
            copyButton.textContent = 'Copy';
        }, 2000);
    });
});