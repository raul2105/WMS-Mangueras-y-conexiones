export type Product = {
    id: string;
    sku: string;
    name: string;
    description?: string;
    type: 'HOSE' | 'FITTING' | 'ASSEMBLY' | 'ACCESSORY';
    brand?: string;
    base_cost?: number;
    price?: number;
    attributes?: Record<string, string | number | boolean | string[]>; // Parsed JSON with typed values
    categoryName?: string;
    stock?: number;
};

export const MOCK_PRODUCTS: Product[] = [
    {
        id: '1',
        sku: 'CON-R1AT-04',
        name: 'Manguera Hidráulica SAE 100 R1AT 1/4"',
        description: 'Manguera de alta presión con refuerzo de una malla de acero.',
        type: 'HOSE',
        brand: 'Continental',
        base_cost: 45.50,
        price: 85.00,
        attributes: {
            pressure_psi: 3263,
            inner_diameter: '1/4"',
            temp_range: '-40°C a +100°C',
            norm: 'SAE 100 R1AT'
        },
        categoryName: 'Hidráulica',
        stock: 150
    },
    {
        id: '2',
        sku: 'FIT-JIC-04-04',
        name: 'Conexión JIC Hembra Giratoria 1/4" x 1/4"',
        description: 'Conexión prensable acero al carbón.',
        type: 'FITTING',
        brand: 'Gates',
        base_cost: 12.00,
        price: 25.00,
        attributes: {
            material: 'Acero',
            thread: 'JIC',
            angle: 'Straight'
        },
        categoryName: 'Conexiones Hidráulicas',
        stock: 500
    },
    {
        id: '3',
        sku: 'ENS-EXCAV-001',
        name: 'Ensamble Manguera Brazo Excavadora',
        description: 'Ensamble 3/4" R12 con proteccion espiral.',
        type: 'ASSEMBLY',
        brand: 'Rigentec',
        base_cost: 450.00,
        price: 950.00,
        attributes: {
            length_mm: 1200,
            components: ['HOSE-R12-12', 'FIT-JIC-12', 'FIT-JIC-12-90']
        },
        categoryName: 'Ensambles',
        stock: 5
    }
];
