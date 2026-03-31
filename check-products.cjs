const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function checkData() {
  try {
    const productCount = await prisma.product.count();
    console.log('Total products:', productCount);
    
    const products = await prisma.product.findMany({
      take: 5,
      include: { category: true }
    });
    
    console.log('Sample products:', JSON.stringify(products, null, 2));
    
    const technicalAttrCount = await prisma.productTechnicalAttribute.count();
    console.log('Technical attributes count:', technicalAttrCount);
    
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

checkData();
