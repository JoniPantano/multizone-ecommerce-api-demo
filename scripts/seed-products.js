const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

const PRODUCT_FIXTURES = [
  { name: 'Yerba Mate Clasica 1kg', description: 'Sabor tradicional, molienda equilibrada.', price: 4200, stock: 30 },
  { name: 'Yerba Mate Suave 1kg', description: 'Perfil suave para consumo diario.', price: 4300, stock: 26 },
  { name: 'Cafe Molido Brasil 500g', description: 'Tueste medio, notas achocolatadas.', price: 6900, stock: 20 },
  { name: 'Cafe en Grano Colombia 1kg', description: 'Tueste medio-alto, aroma intenso.', price: 12900, stock: 14 },
  { name: 'Azucar Organica 1kg', description: 'Azucar rubia de origen organico.', price: 2100, stock: 40 },
  { name: 'Harina 0000 1kg', description: 'Ideal para panificados y reposteria.', price: 1350, stock: 55 },
  { name: 'Arroz Largo Fino 1kg', description: 'Grano largo, coccion uniforme.', price: 1800, stock: 44 },
  { name: 'Fideos Spaghetti 500g', description: 'Pasta seca de semola.', price: 1200, stock: 60 },
  { name: 'Pure de Tomate 520g', description: 'Sin conservantes artificiales.', price: 950, stock: 70 },
  { name: 'Atun al Natural 170g', description: 'En lata, alto contenido proteico.', price: 2600, stock: 38 },
  { name: 'Leche Larga Vida 1L', description: 'Leche entera UAT.', price: 1500, stock: 48 },
  { name: 'Queso Cremoso 500g', description: 'Textura suave, corte facil.', price: 5200, stock: 18 },
  { name: 'Yogur Natural 1L', description: 'Sin azucar agregada.', price: 2400, stock: 24 },
  { name: 'Aceite de Girasol 1.5L', description: 'Apto coccion y fritura.', price: 3900, stock: 33 },
  { name: 'Aceite de Oliva 500ml', description: 'Extra virgen, acidez controlada.', price: 7800, stock: 17 },
  { name: 'Galletitas de Agua 300g', description: 'Clasicas, crocantes.', price: 1300, stock: 64 },
  { name: 'Galletitas Dulces Vainilla 300g', description: 'Sabor vainilla, textura liviana.', price: 1600, stock: 52 },
  { name: 'Mermelada Frutilla 454g', description: 'Con trozos de fruta.', price: 2800, stock: 29 },
  { name: 'Miel Pura 500g', description: 'Miel multifloral.', price: 4600, stock: 22 },
  { name: 'Sal Fina 500g', description: 'Sal refinada para mesa.', price: 700, stock: 80 },
  { name: 'Pimienta Negra Molida 50g', description: 'Molida fina, aroma intenso.', price: 1700, stock: 36 },
  { name: 'Avena Instantanea 500g', description: 'Copos finos de avena.', price: 2100, stock: 45 },
  { name: 'Granola Frutos Secos 400g', description: 'Mix de avena, semillas y frutos.', price: 4300, stock: 27 },
  { name: 'Pan Integral Molde 550g', description: 'Pan de molde con harina integral.', price: 2500, stock: 16 },
  { name: 'Dulce de Leche Clasico 400g', description: 'Receta tradicional.', price: 3200, stock: 31 },
  { name: 'Chocolate Semiamargo 100g', description: 'Tableta cacao 55%.', price: 1900, stock: 42 },
  { name: 'Agua Mineral 2L', description: 'Sin gas.', price: 1100, stock: 75 },
  { name: 'Jugo Naranja 1L', description: 'Bebida citrica sabor naranja.', price: 1700, stock: 34 },
];

async function ensureZone() {
  let zone = await prisma.zone.findFirst({ orderBy: { id: 'asc' } });
  if (!zone) {
    zone = await prisma.zone.create({
      data: {
        name: 'Default Zone',
        description: 'Zona por defecto',
      },
    });
  }
  return zone;
}

async function seedProducts() {
  const zone = await ensureZone();

  const data = PRODUCT_FIXTURES.map((item) => ({
    ...item,
    zoneId: zone.id,
    isActive: true,
  }));

  const result = await prisma.product.createMany({
    data,
    skipDuplicates: false,
  });

  console.log(`Seed complete. Created ${result.count} products in zone ${zone.id}.`);
}

seedProducts()
  .catch((error) => {
    console.error('Seed failed:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
