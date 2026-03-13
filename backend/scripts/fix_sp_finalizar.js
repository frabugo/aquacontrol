// backend/scripts/fix_sp_finalizar.js
// Fix: sp_finalizar_ruta ya NO resetea llenos_sobrantes ni vacios_devueltos a 0.
// Así el stock remanente queda registrado y se puede arrastrar a la siguiente ruta.
const db = require('../db');

const steps = [
  { name: 'DROP sp_finalizar_ruta', sql: 'DROP PROCEDURE IF EXISTS sp_finalizar_ruta' },
  {
    name: 'CREATE sp_finalizar_ruta (preserva stock)',
    sql: `CREATE PROCEDURE sp_finalizar_ruta(
  IN p_ruta_id     INT,
  IN p_usuario_id  INT
)
BEGIN
  -- Devolver llenos sobrantes a planta (sin resetear el campo en stock_vehiculo)
  UPDATE presentaciones p
  JOIN stock_vehiculo sv ON sv.presentacion_id = p.id AND sv.ruta_id = p_ruta_id
     SET p.stock_llenos = p.stock_llenos + sv.llenos_sobrantes;

  -- Devolver vacíos a planta (sin resetear el campo en stock_vehiculo)
  UPDATE presentaciones p
  JOIN stock_vehiculo sv ON sv.presentacion_id = p.id AND sv.ruta_id = p_ruta_id
     SET p.stock_vacios = p.stock_vacios + sv.vacios_devueltos;

  -- Marcar ruta como finalizada
  UPDATE rutas
     SET estado = 'finalizada', hora_regreso = NOW()
   WHERE id = p_ruta_id;
END`,
  },
];

(async () => {
  const conn = await db.getConnection();
  let ok = 0, failed = 0;
  try {
    for (const step of steps) {
      try {
        await conn.query(step.sql);
        console.log(`✅ [${++ok}] ${step.name}`);
      } catch (err) {
        console.error(`❌ [FAIL] ${step.name}`);
        console.error(`   ${err.message}`);
        failed++;
      }
    }
  } finally {
    conn.release();
    console.log(`\nDone: ${ok} ok, ${failed} failed`);
    process.exit(failed > 0 ? 1 : 0);
  }
})();
