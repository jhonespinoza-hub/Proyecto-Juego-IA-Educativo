require('dotenv').config(); // <-- Carga de variables de entorno

const express = require('express');
const cors = require('cors');
const multer = require('multer');
const XLSX = require('xlsx');
const bcrypt = require('bcryptjs');
const db = require('./db');

const app = express();

// Configuración amplia de CORS para desarrollo
app.use(cors({
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    allowedHeaders: ['Content-Type', 'Authorization', 'x-admin-id']
}));

app.use(express.json());

// Configuración de Multer con filtros de seguridad para Excel
const upload = multer({ 
    storage: multer.memoryStorage(),
    limits: { fileSize: 5 * 1024 * 1024 }, // Límite de 5 MB
    fileFilter: (req, file, cb) => {
        const allowedMimes = [
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            'application/vnd.ms-excel'
        ];
        if (allowedMimes.includes(file.mimetype) || file.originalname.match(/\.(xlsx|xls)$/i)) {
            cb(null, true);
        } else {
            cb(new Error('Formato de archivo no válido. Solo se aceptan archivos Excel (.xlsx, .xls)'));
        }
    }
});

// ==========================================
// FUNCIÓN DE AUTO-CREACIÓN DE ADMINISTRADOR
// ==========================================
async function inicializarAdmin() {
    try {
        // Lee las credenciales del archivo .env; si no existen, usa valores por defecto
        const correoAdmin = process.env.ADMIN_EMAIL || 'admin@escuela.com';
        const passwordPlana = process.env.ADMIN_PASSWORD || 'admin1234';

        const passwordHash = await bcrypt.hash(passwordPlana, 10);

        const [rows] = await db.query('SELECT * FROM docentes WHERE correo = ?', [correoAdmin]);

        if (rows.length === 0) {
            await db.query(
                'INSERT INTO docentes (nombre, correo, password, rol) VALUES (?, ?, ?, ?)',
                ['Administrador Principal', correoAdmin, passwordHash, 'admin']
            );
            console.log('✅ Usuario Administrador creado por primera vez.');
        } else {
            await db.query(
                'UPDATE docentes SET password = ?, rol = "admin" WHERE correo = ?',
                [passwordHash, correoAdmin]
            );
            console.log('🔄 Contraseña del Administrador sincronizada correctamente.');
        }
        console.log(`📌 Credenciales Admin -> Correo: ${correoAdmin} | Clave: ${passwordPlana}`);
    } catch (err) {
        console.error('⚠️ Error al inicializar usuario admin:', err.message);
    }
}

// ==========================================
// 1. AUTENTICACIÓN Y DOCENTES
// ==========================================

app.post('/api/login', async (req, res) => {
    const { correo, password } = req.body;
    if (!correo || !password) {
        return res.status(400).json({ error: 'Por favor, ingresa correo y contraseña.' });
    }

    try {
        const [rows] = await db.query('SELECT * FROM docentes WHERE correo = ?', [correo]);
        if (rows.length === 0) {
            return res.status(401).json({ error: 'Correo o contraseña incorrectos.' });
        }

        const docente = rows[0];
        const isMatch = await bcrypt.compare(password, docente.password);

        if (!isMatch) {
            return res.status(401).json({ error: 'Correo o contraseña incorrectos.' });
        }

        res.json({
            status: 'ok',
            message: 'Acceso concedido',
            docente: {
                id_docente: docente.id_docente || docente.id,
                nombre: docente.nombre || docente.nombre_completo,
                correo: docente.correo,
                rol: docente.rol || 'docente'
            }
        });
    } catch (err) {
        console.error('Error en /api/login:', err);
        res.status(500).json({ error: err.message });
    }
});

// Oculta al Administrador de la lista pública desplegable en el frontend
app.get('/api/docentes', async (req, res) => {
    try {
        const [rows] = await db.query("SELECT id_docente, nombre, correo, rol FROM docentes WHERE rol != 'admin'");
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/docentes', async (req, res) => {
    const { nombre, correo, password } = req.body;
    if (!nombre || !correo || !password) {
        return res.status(400).json({ error: 'Todos los campos son obligatorios.' });
    }

    try {
        const hashedPassword = await bcrypt.hash(password, 10);
        const [result] = await db.query(
            'INSERT INTO docentes (nombre, correo, password, rol) VALUES (?, ?, ?, "docente")',
            [nombre, correo, hashedPassword]
        );
        res.status(201).json({ status: 'ok', id_docente: result.insertId });
    } catch (err) {
        if (err.code === 'ER_DUP_ENTRY') {
            return res.status(400).json({ error: 'El correo electrónico ya se encuentra registrado.' });
        }
        res.status(500).json({ error: err.message });
    }
});

// ==========================================
// 2. RUTAS DE CONTROL TOTAL (ADMINISTRADOR)
// ==========================================

app.get('/api/admin/docentes', async (req, res) => {
    try {
        const [rows] = await db.query('SELECT id_docente, nombre, correo, rol FROM docentes ORDER BY id_docente DESC');
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.delete('/api/admin/docentes/:id', async (req, res) => {
    const { id } = req.params;
    try {
        // Validación para evitar borrar al administrador
        const [docente] = await db.query('SELECT rol FROM docentes WHERE id_docente = ?', [id]);
        if (docente.length > 0 && docente[0].rol === 'admin') {
            return res.status(400).json({ error: 'No se puede eliminar al usuario Administrador Principal.' });
        }

        const [result] = await db.query('DELETE FROM docentes WHERE id_docente = ?', [id]);
        
        if (result.affectedRows > 0) {
            res.json({ status: 'ok', message: 'Docente eliminado correctamente del sistema.' });
        } else {
            res.status(404).json({ error: 'No se encontró al docente especificado.' });
        }
    } catch (err) {
        console.error('Error al eliminar docente:', err);
        res.status(500).json({ error: 'Error al intentar eliminar el docente.' });
    }
});

app.get('/api/admin/cursos', async (req, res) => {
    try {
        const query = `
            SELECT c.id_curso, c.nombre_curso, c.id_docente, d.nombre AS nombre_docente, d.correo AS correo_docente 
            FROM cursos c 
            LEFT JOIN docentes d ON c.id_docente = d.id_docente 
            ORDER BY c.id_curso DESC
        `;
        const [rows] = await db.query(query);
        res.json(rows);
    } catch (err) {
        console.error('Error al obtener cursos admin:', err);
        res.status(500).json({ error: err.message });
    }
});

app.put('/api/admin/cursos/:id/docente', async (req, res) => {
    const { id } = req.params;
    const { id_docente } = req.body;

    if (!id_docente) {
        return res.status(400).json({ error: 'Debes seleccionar un docente válido.' });
    }

    try {
        const [result] = await db.query('UPDATE cursos SET id_docente = ? WHERE id_curso = ?', [id_docente, id]);

        if (result.affectedRows > 0) {
            res.json({ status: 'ok', message: 'Docente reasignado al curso con éxito.' });
        } else {
            res.status(404).json({ error: 'No se encontró el curso especificado.' });
        }
    } catch (err) {
        console.error('Error al reasignar docente:', err);
        res.status(500).json({ error: err.message });
    }
});

// ELIMINAR CURSO COMPLETO (FINAL DE CICLO ESCOLAR)
app.delete('/api/admin/cursos/:id', async (req, res) => {
    const { id } = req.params;
    try {
        const [result] = await db.query('DELETE FROM cursos WHERE id_curso = ?', [id]);

        if (result.affectedRows > 0) {
            res.json({ status: 'ok', message: 'Curso y todos sus alumnos/historiales asociados fueron eliminados correctamente.' });
        } else {
            res.status(404).json({ error: 'No se encontró el curso especificado.' });
        }
    } catch (err) {
        console.error('Error al eliminar curso:', err);
        res.status(500).json({ error: 'Error al intentar eliminar el curso de la base de datos.' });
    }
});

// ==========================================
// 3. API DE JUEGO, ALUMNOS Y REPORTES
// ==========================================

app.get('/api/cursos', async (req, res) => {
    const { id_docente } = req.query;
    try {
        let query = 'SELECT * FROM cursos';
        const params = [];

        if (id_docente) {
            query += ' WHERE id_docente = ?';
            params.push(id_docente);
        }

        const [rows] = await db.query(query, params);
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/cursos/docente/:idDocente', async (req, res) => {
    try {
        const idDocente = req.params.idDocente;
        
        if (!idDocente || idDocente === 'undefined' || idDocente === 'null') {
            return res.status(400).json({ error: 'ID de docente no válido.' });
        }

        const [rows] = await db.query('SELECT * FROM cursos WHERE id_docente = ?', [idDocente]);
        res.json(rows);
    } catch (err) {
        console.error('Error al consultar cursos del docente:', err);
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/alumnos', async (req, res) => {
    const { id_curso } = req.query;
    if (!id_curso) {
        return res.status(400).json({ error: 'El parámetro id_curso es requerido.' });
    }

    try {
        const [rows] = await db.query('SELECT * FROM alumnos WHERE id_curso = ? ORDER BY nombre_completo ASC', [id_curso]);
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/alumnos/:idCurso', async (req, res) => {
    try {
        const idCurso = req.params.idCurso;

        if (!idCurso || idCurso === 'undefined' || idCurso === 'null') {
            return res.status(400).json({ error: 'ID de curso no válido.' });
        }

        const [rows] = await db.query('SELECT * FROM alumnos WHERE id_curso = ? ORDER BY nombre_completo ASC', [idCurso]);
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.delete('/api/alumnos/:id', async (req, res) => {
    const { id } = req.params;
    try {
        const [result] = await db.query('DELETE FROM alumnos WHERE id_alumno = ?', [id]);
        
        if (result.affectedRows > 0) {
            res.json({ status: 'ok', message: 'Alumno eliminado correctamente.' });
        } else {
            res.status(404).json({ error: 'No se encontró al alumno especificado.' });
        }
    } catch (err) {
        console.error('Error al eliminar alumno:', err);
        res.status(500).json({ error: 'Error interno al intentar eliminar al alumno.' });
    }
});

app.post('/api/partidas', async (req, res) => {
    const { id_alumno, puntuacion, tiempo, errores, id_juego = 2 } = req.body;
    
    try {
        await db.query('CALL sp_guardar_partida(?, ?, ?, ?, @id_partida)', [
            id_alumno, puntuacion, tiempo, id_juego
        ]);
        
        const [idResult] = await db.query('SELECT @id_partida AS id_partida');
        const id_partida = idResult[0].id_partida;

        if (errores && errores.length > 0) {
            const errorValues = errores.map(e => [
                id_partida, 
                e.operacion || e.op, 
                e.esperado || e.esp, 
                e.mostrado || e.det
            ]);

            await db.query(
                'INSERT INTO detalle_errores (id_partida, operacion_planteada, respuesta_esperada, respuesta_detectada) VALUES ?',
                [errorValues]
            );
        }

        res.json({ status: 'ok', id_partida });
    } catch (err) {
        console.error('Error al guardar partida:', err);
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/reportes', async (req, res) => {
    try {
        const [rows] = await db.query('SELECT * FROM vista_reportes_docente ORDER BY fecha_partida DESC');
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ==========================================
// 4. RUTAS DE ADMINISTRACIÓN
// ==========================================

app.post('/api/cursos', async (req, res) => {
    const { nombre_curso, id_docente } = req.body;
    try {
        const [result] = await db.query(
            'INSERT INTO cursos (nombre_curso, id_docente) VALUES (?, ?)',
            [nombre_curso, id_docente]
        );
        res.status(201).json({ status: 'ok', message: 'Curso creado con éxito.', id_curso: result.insertId });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/alumnos', async (req, res) => {
    const { nombre_completo, codigo_estudiante, id_curso } = req.body;
    try {
        const [existentes] = await db.query(
            'SELECT id_alumno FROM alumnos WHERE LOWER(nombre_completo) = LOWER(?) OR (codigo_estudiante IS NOT NULL AND codigo_estudiante = ?)',
            [nombre_completo.trim(), codigo_estudiante || '']
        );

        if (existentes.length > 0) {
            return res.status(400).json({ error: 'El alumno o código ya se encuentra registrado en el sistema.' });
        }

        const [result] = await db.query(
            'INSERT INTO alumnos (nombre_completo, codigo_estudiante, id_curso) VALUES (?, ?, ?)',
            [nombre_completo.trim(), codigo_estudiante || null, id_curso]
        );
        res.status(201).json({ status: 'ok', message: 'Alumno registrado exitosamente.', id_alumno: result.insertId });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ==========================================
// 5. IMPORTACIÓN MASIVA EXCEL
// ==========================================

app.post('/api/alumnos/upload-excel', upload.single('excelFile'), async (req, res) => {
    try {
        const { id_curso } = req.body;

        if (!req.file || !id_curso) {
            return res.status(400).json({ error: 'Falta el archivo Excel o el ID del curso.' });
        }

        const workbook = XLSX.read(req.file.buffer, { type: 'buffer' });
        const sheetName = workbook.SheetNames[0];
        const sheetData = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName]);

        if (sheetData.length === 0) {
            return res.status(400).json({ error: 'El archivo Excel no contiene datos.' });
        }

        const alumnosExcel = sheetData
            .map(row => {
                const keys = Object.keys(row);
                
                const nombreKey = keys.find(k => {
                    const clean = k.toLowerCase().trim();
                    return clean.includes('nombre') || clean.includes('alumno');
                });

                const codigoKey = keys.find(k => {
                    const clean = k.toLowerCase().trim();
                    return clean.includes('codigo') || clean.includes('código');
                });

                const nombre = nombreKey && row[nombreKey] ? String(row[nombreKey]).trim() : null;
                const codigoRaw = codigoKey ? row[codigoKey] : null;
                const codigo = codigoRaw !== null && codigoRaw !== undefined ? String(codigoRaw).trim() : null;

                return nombre ? { nombre, codigo } : null;
            })
            .filter(item => item !== null);

        if (alumnosExcel.length === 0) {
            return res.status(400).json({ 
                error: 'No se encontraron nombres de alumnos válidos en el archivo Excel.' 
            });
        }

        const [alumnosDB] = await db.query('SELECT LOWER(nombre_completo) AS nombre, codigo_estudiante AS codigo FROM alumnos');
        
        const nombresExistentesDB = new Set(alumnosDB.map(a => a.nombre));
        const codigosExistentesDB = new Set(alumnosDB.filter(a => a.codigo).map(a => String(a.codigo).toLowerCase()));

        const nuevosAInsertar = [];
        const nombresEnEsteExcel = new Set();
        let omitidosCount = 0;

        for (const alumno of alumnosExcel) {
            const nombreLower = alumno.nombre.toLowerCase();
            const codigoLower = alumno.codigo ? alumno.codigo.toLowerCase() : null;

            const yaExisteEnBD = nombresExistentesDB.has(nombreLower) || (codigoLower && codigosExistentesDB.has(codigoLower));
            const yaProcesadoEnExcel = nombresEnEsteExcel.has(nombreLower);

            if (yaExisteEnBD || yaProcesadoEnExcel) {
                omitidosCount++;
            } else {
                nombresEnEsteExcel.add(nombreLower);
                nuevosAInsertar.push([alumno.nombre, alumno.codigo, id_curso]);
            }
        }

        if (nuevosAInsertar.length === 0) {
            return res.status(400).json({ 
                error: 'Todos los alumnos del archivo Excel ya existen en la base de datos (en este o en otro curso).' 
            });
        }

        const query = 'INSERT INTO alumnos (nombre_completo, codigo_estudiante, id_curso) VALUES ?';
        const [result] = await db.query(query, [nuevosAInsertar]);

        let message = `¡Importación exitosa! Se guardaron ${result.affectedRows} alumnos nuevos.`;
        if (omitidosCount > 0) {
            message += ` (Se omitieron ${omitidosCount} registros que ya existían).`;
        }

        return res.status(200).json({ status: 'ok', message });

    } catch (err) {
        console.error('Error al importar archivo Excel:', err);
        return res.status(500).json({ error: err.message || 'Error interno al procesar el archivo Excel.' });
    }
});

app.use((err, req, res, next) => {
    if (err instanceof multer.MulterError || err.message) {
        return res.status(400).json({ error: err.message });
    }
    next(err);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', async () => {
    console.log(`🚀 Servidor listo ejecutándose en el puerto ${PORT}`);
    await inicializarAdmin();
});