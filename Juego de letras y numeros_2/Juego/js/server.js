require('dotenv').config();

const express = require('express');
const cors = require('cors');
const multer = require('multer');
const XLSX = require('xlsx');
const bcrypt = require('bcryptjs');
const db = require('./db');

const app = express();

// Configuración CORS y Parseo de JSON
app.use(cors({
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    allowedHeaders: ['Content-Type', 'Authorization', 'x-admin-id']
}));

app.use(express.json());

// Configuración Multer para carga de Excel
const upload = multer({ 
    storage: multer.memoryStorage(),
    limits: { fileSize: 5 * 1024 * 1024 },
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

// Inicialización de credenciales de Administrador Principal
async function inicializarAdmin() {
    try {
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
                id_docente: docente.id_docente,
                nombre: docente.nombre,
                correo: docente.correo,
                rol: docente.rol || 'docente'
            }
        });
    } catch (err) {
        console.error('Error en /api/login:', err);
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/docentes', async (req, res) => {
    try {
        const [rows] = await db.query("SELECT id_docente, nombre, correo, rol FROM docentes WHERE rol != 'admin' ORDER BY nombre ASC");
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/docentes', async (req, res) => {
    const { nombre, correo, password, rol } = req.body;
    if (!nombre || !correo || !password) {
        return res.status(400).json({ error: 'Todos los campos son obligatorios.' });
    }

    try {
        const hashedPassword = await bcrypt.hash(password, 10);
        const [result] = await db.query(
            'INSERT INTO docentes (nombre, correo, password, rol) VALUES (?, ?, ?, ?)',
            [nombre.trim(), correo.trim(), hashedPassword, rol || 'docente']
        );
        res.status(201).json({ status: 'ok', id_docente: result.insertId, message: 'Docente registrado con éxito.' });
    } catch (err) {
        if (err.code === 'ER_DUP_ENTRY') {
            return res.status(400).json({ error: 'El correo electrónico ya se encuentra registrado.' });
        }
        res.status(500).json({ error: err.message });
    }
});

// ==========================================
// 2. PERIODOS ACADÉMICOS
// ==========================================

app.get('/api/periodos', async (req, res) => {
    try {
        const [rows] = await db.query('SELECT * FROM periodos_academicos ORDER BY fecha_inicio DESC, id_periodo DESC');
        res.json(rows);
    } catch (err) {
        console.error('Error al obtener periodos:', err);
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/periodos', async (req, res) => {
    const { nombre_periodo, fecha_inicio, fecha_fin, estado } = req.body;

    if (!nombre_periodo || !fecha_inicio || !fecha_fin) {
        return res.status(400).json({ error: 'Nombre del periodo, fecha de inicio y fecha de fin son obligatorios.' });
    }

    try {
        const [result] = await db.query(
            'INSERT INTO periodos_academicos (nombre_periodo, fecha_inicio, fecha_fin, estado) VALUES (?, ?, ?, ?)',
            [nombre_periodo.trim(), fecha_inicio, fecha_fin, estado || 'Activo']
        );
        res.status(201).json({ status: 'ok', message: 'Periodo académico creado con éxito.', id_periodo: result.insertId });
    } catch (err) {
        console.error('Error al crear periodo:', err);
        res.status(500).json({ error: err.message });
    }
});

app.put('/api/periodos/:id', async (req, res) => {
    const { id } = req.params;
    const { nombre_periodo, fecha_inicio, fecha_fin, estado } = req.body;

    if (!nombre_periodo || !fecha_inicio || !fecha_fin) {
        return res.status(400).json({ error: 'Todos los campos son obligatorios.' });
    }

    try {
        const [result] = await db.query(
            'UPDATE periodos_academicos SET nombre_periodo = ?, fecha_inicio = ?, fecha_fin = ?, estado = ? WHERE id_periodo = ?',
            [nombre_periodo.trim(), fecha_inicio, fecha_fin, estado || 'Activo', id]
        );

        if (result.affectedRows > 0) {
            res.json({ status: 'ok', message: 'Periodo académico actualizado correctamente.' });
        } else {
            res.status(404).json({ error: 'No se encontró el periodo especificado.' });
        }
    } catch (err) {
        console.error('Error al actualizar periodo:', err);
        res.status(500).json({ error: err.message });
    }
});

app.delete('/api/periodos/:id', async (req, res) => {
    const { id } = req.params;
    try {
        const [cursos] = await db.query('SELECT id_curso FROM cursos WHERE id_periodo = ?', [id]);
        if (cursos.length > 0) {
            return res.status(400).json({ error: 'No se puede eliminar el periodo porque existen cursos asociados a él.' });
        }

        const [result] = await db.query('DELETE FROM periodos_academicos WHERE id_periodo = ?', [id]);

        if (result.affectedRows > 0) {
            res.json({ status: 'ok', message: 'Periodo académico eliminado con éxito.' });
        } else {
            res.status(404).json({ error: 'No se encontró el periodo especificado.' });
        }
    } catch (err) {
        console.error('Error al eliminar periodo:', err);
        res.status(500).json({ error: err.message });
    }
});

// ==========================================
// 3. RUTAS DE CONTROL TOTAL (ADMINISTRADOR)
// ==========================================

app.get('/api/admin/docentes', async (req, res) => {
    try {
        const [rows] = await db.query('SELECT id_docente, nombre, correo, rol FROM docentes ORDER BY id_docente DESC');
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// CREAR DOCENTE DESDE PANEL ADMIN
app.post('/api/admin/docentes', async (req, res) => {
    const { nombre, correo, password, rol } = req.body;
    if (!nombre || !correo || !password) {
        return res.status(400).json({ error: 'Todos los campos son obligatorios.' });
    }

    try {
        const hashedPassword = await bcrypt.hash(password, 10);
        const [result] = await db.query(
            'INSERT INTO docentes (nombre, correo, password, rol) VALUES (?, ?, ?, ?)',
            [nombre.trim(), correo.trim(), hashedPassword, rol || 'docente']
        );
        res.status(201).json({ status: 'ok', id_docente: result.insertId, message: 'Docente creado con éxito.' });
    } catch (err) {
        if (err.code === 'ER_DUP_ENTRY') {
            return res.status(400).json({ error: 'El correo electrónico ya se encuentra registrado.' });
        }
        res.status(500).json({ error: err.message });
    }
});

// ACTUALIZAR DOCENTE DESDE PANEL ADMIN
app.put('/api/admin/docentes/:id', async (req, res) => {
    const { id } = req.params;
    const { nombre, correo, password, rol } = req.body;

    if (!nombre || !correo) {
        return res.status(400).json({ error: 'Nombre y correo son obligatorios.' });
    }

    try {
        const [dupCheck] = await db.query(
            'SELECT id_docente FROM docentes WHERE correo = ? AND id_docente != ?',
            [correo.trim(), id]
        );

        if (dupCheck.length > 0) {
            return res.status(400).json({ error: 'El correo electrónico ya está en uso por otro docente.' });
        }

        if (password && password.trim() !== '') {
            const hashedPassword = await bcrypt.hash(password, 10);
            await db.query(
                'UPDATE docentes SET nombre = ?, correo = ?, password = ?, rol = ? WHERE id_docente = ?',
                [nombre.trim(), correo.trim(), hashedPassword, rol || 'docente', id]
            );
        } else {
            await db.query(
                'UPDATE docentes SET nombre = ?, correo = ?, rol = ? WHERE id_docente = ?',
                [nombre.trim(), correo.trim(), rol || 'docente', id]
            );
        }

        res.json({ status: 'ok', message: 'Docente actualizado correctamente.' });
    } catch (err) {
        console.error('Error al actualizar docente:', err);
        res.status(500).json({ error: err.message });
    }
});

app.delete('/api/admin/docentes/:id', async (req, res) => {
    const { id } = req.params;
    try {
        const [docente] = await db.query('SELECT rol FROM docentes WHERE id_docente = ?', [id]);
        if (docente.length > 0 && docente[0].rol === 'admin') {
            return res.status(400).json({ error: 'No se puede eliminar al usuario Administrador Principal.' });
        }

        await db.query('UPDATE cursos SET id_docente = NULL WHERE id_docente = ?', [id]);

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
    const { id_periodo } = req.query;
    try {
        let query = `
            SELECT 
                c.id_curso, 
                c.nombre_curso, 
                c.id_docente, 
                c.id_periodo,
                p.nombre_periodo,
                d.nombre AS nombre_docente, 
                d.correo AS correo_docente 
            FROM cursos c 
            LEFT JOIN docentes d ON c.id_docente = d.id_docente 
            LEFT JOIN periodos_academicos p ON c.id_periodo = p.id_periodo
        `;
        const params = [];

        if (id_periodo) {
            query += ' WHERE c.id_periodo = ?';
            params.push(id_periodo);
        }

        query += ' ORDER BY c.id_curso DESC';

        const [rows] = await db.query(query, params);
        res.json(rows);
    } catch (err) {
        console.error('Error al obtener cursos admin:', err);
        res.status(500).json({ error: err.message });
    }
});

app.put('/api/admin/cursos/:id', async (req, res) => {
    const { id } = req.params;
    const { nombre_curso, id_periodo, id_docente } = req.body;

    try {
        let query = 'UPDATE cursos SET ';
        const fields = [];
        const params = [];

        if (nombre_curso !== undefined) {
            fields.push('nombre_curso = ?');
            params.push(nombre_curso.trim());
        }
        if (id_periodo !== undefined) {
            fields.push('id_periodo = ?');
            params.push(id_periodo || null);
        }
        if (id_docente !== undefined) {
            fields.push('id_docente = ?');
            params.push(id_docente || null);
        }

        if (fields.length === 0) {
            return res.status(400).json({ error: 'No se enviaron campos para actualizar.' });
        }

        query += fields.join(', ') + ' WHERE id_curso = ?';
        params.push(id);

        const [result] = await db.query(query, params);

        if (result.affectedRows > 0) {
            res.json({ status: 'ok', message: 'Curso actualizado con éxito.' });
        } else {
            res.status(404).json({ error: 'No se encontró el curso especificado.' });
        }
    } catch (err) {
        console.error('Error al editar curso:', err);
        res.status(500).json({ error: err.message });
    }
});

app.put('/api/admin/cursos/:id/docente', async (req, res) => {
    const { id } = req.params;
    const { id_docente } = req.body;

    try {
        const [result] = await db.query(
            'UPDATE cursos SET id_docente = ? WHERE id_curso = ?',
            [id_docente || null, id]
        );

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

app.delete('/api/admin/cursos/:id', async (req, res) => {
    const { id } = req.params;
    try {
        const [result] = await db.query('DELETE FROM cursos WHERE id_curso = ?', [id]);

        if (result.affectedRows > 0) {
            res.json({ status: 'ok', message: 'Curso y sus registros asociados fueron eliminados correctamente.' });
        } else {
            res.status(404).json({ error: 'No se encontró el curso especificado.' });
        }
    } catch (err) {
        console.error('Error al eliminar curso:', err);
        res.status(500).json({ error: 'Error al intentar eliminar el curso de la base de datos.' });
    }
});

// ==========================================
// 4. API DE JUEGO, ALUMNOS Y REPORTES
// ==========================================

app.get('/api/cursos', async (req, res) => {
    const { id_docente, id_periodo } = req.query;
    try {
        let query = `
            SELECT c.*, p.nombre_periodo 
            FROM cursos c
            LEFT JOIN periodos_academicos p ON c.id_periodo = p.id_periodo
        `;
        const conditions = [];
        const params = [];

        if (id_docente) {
            conditions.push('c.id_docente = ?');
            params.push(id_docente);
        }

        if (id_periodo) {
            conditions.push('c.id_periodo = ?');
            params.push(id_periodo);
        }

        if (conditions.length > 0) {
            query += ' WHERE ' + conditions.join(' AND ');
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
        const { id_periodo } = req.query;

        if (!idDocente || idDocente === 'undefined' || idDocente === 'null') {
            return res.status(400).json({ error: 'ID de docente no válido.' });
        }

        let query = `
            SELECT c.*, p.nombre_periodo 
            FROM cursos c
            LEFT JOIN periodos_academicos p ON c.id_periodo = p.id_periodo
            WHERE c.id_docente = ?
        `;
        const params = [idDocente];

        if (id_periodo) {
            query += ' AND c.id_periodo = ?';
            params.push(id_periodo);
        }

        const [rows] = await db.query(query, params);
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

app.put('/api/alumnos/:id', async (req, res) => {
    const { id } = req.params;
    const { nombre_completo } = req.body;

    if (!nombre_completo || !nombre_completo.trim()) {
        return res.status(400).json({ error: 'El nombre completo es obligatorio.' });
    }

    try {
        const [existentes] = await db.query(
            'SELECT id_alumno FROM alumnos WHERE LOWER(nombre_completo) = LOWER(?) AND id_alumno != ?',
            [nombre_completo.trim(), id]
        );

        if (existentes.length > 0) {
            return res.status(400).json({ error: 'Ya existe otro alumno registrado con ese nombre.' });
        }

        const [result] = await db.query(
            'UPDATE alumnos SET nombre_completo = ? WHERE id_alumno = ?',
            [nombre_completo.trim(), id]
        );

        if (result.affectedRows > 0) {
            res.json({ status: 'ok', message: 'Alumno actualizado correctamente.' });
        } else {
            res.status(404).json({ error: 'No se encontró el alumno especificado.' });
        }
    } catch (err) {
        console.error('Error al actualizar alumno:', err);
        res.status(500).json({ error: 'Error interno al actualizar los datos del alumno.' });
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
    const { id_docente, id_periodo } = req.query;

    try {
        let query = 'SELECT * FROM vista_reportes_docente';
        const conditions = [];
        const params = [];

        if (id_docente) {
            conditions.push('id_docente = ?');
            params.push(id_docente);
        }

        if (id_periodo) {
            conditions.push('id_periodo = ?');
            params.push(id_periodo);
        }

        if (conditions.length > 0) {
            query += ' WHERE ' + conditions.join(' AND ');
        }

        query += ' ORDER BY fecha_partida DESC';

        const [rows] = await db.query(query, params);
        res.json(rows);
    } catch (err) {
        console.error('Error al obtener reportes:', err);
        res.status(500).json({ error: err.message });
    }
});

// ==========================================
// 5. RUTAS DE ADMINISTRACIÓN Y CURSOS
// ==========================================

app.post('/api/cursos', async (req, res) => {
    const { nombre_curso, id_docente, id_periodo } = req.body;

    if (!nombre_curso) {
        return res.status(400).json({ error: 'El nombre del curso es requerido.' });
    }

    try {
        const [result] = await db.query(
            'INSERT INTO cursos (nombre_curso, id_docente, id_periodo) VALUES (?, ?, ?)',
            [nombre_curso.trim(), id_docente || null, id_periodo || null]
        );
        res.status(201).json({ status: 'ok', message: 'Curso creado con éxito.', id_curso: result.insertId });
    } catch (err) {
        console.error('Error al crear curso:', err);
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/alumnos', async (req, res) => {
    const { nombre_completo, codigo_estudiante, id_curso } = req.body;
    try {
        const [existentes] = await db.query(
            'SELECT id_alumno FROM alumnos WHERE LOWER(nombre_completo) = LOWER(?) OR (codigo_estudiante IS NOT NULL AND codigo_estudiante = ? AND codigo_estudiante != "")',
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
// 6. IMPORTACIÓN MASIVA EXCEL
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

// Manejador global de errores Multer
app.use((err, req, res, next) => {
    if (err instanceof multer.MulterError || err.message) {
        return res.status(400).json({ error: err.message });
    }
    next(err);
});

// Inicialización del Servidor
const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', async () => {
    console.log(`🚀 Servidor listo ejecutándose en el puerto ${PORT}`);
    await inicializarAdmin();
});

module.exports = app;