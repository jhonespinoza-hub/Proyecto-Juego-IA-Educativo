const mysql = require('mysql2');

const pool = mysql.createPool({
    host: 'localhost',
    user: 'root',      
    password: '',      
    database: 'sistema_juego_matematicas',
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
    multipleStatements: true // <--- Habilitar ejecuciones compuestas / Stored Procedures
});

module.exports = pool.promise()