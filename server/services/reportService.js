const cron = require('node-cron'); //
const nodemailer = require('nodemailer'); //

const transporter = nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 587,
    auth: { user: 'seu-email@gmail.com', pass: 'sua-senha' }
});

const initReports = () => {
    // Relatório Diário às 08:00
    cron.schedule('0 8 * * *', async () => {
        await transporter.sendMail({
            from: '"BEL FIRE" <belfire@usina.com>',
            to: 'gerente@usina.com',
            subject: 'Relatório Diário de Operação - Bagaço',
            text: 'O sistema BEL FIRE monitorou as pilhas normalmente nas últimas 24h.'
        });
        console.log('Relatório enviado com sucesso.');
    });
};

module.exports = { initReports };