const bcrypt = require('bcrypt');
const { User } = require('../models');
require('dotenv').config();

const ADMIN_EMAIL = process.env.ADMIN_SEED_EMAIL || 'admin@isco.co.rw';
const ADMIN_PASSWORD = process.env.ADMIN_SEED_PASSWORD || 'admin123!';
const ADMIN_NAME = process.env.ADMIN_SEED_NAME || 'System Admin';

async function seedAdmin() {
    try {
        const existing = await User.findOne({ where: { email: ADMIN_EMAIL } });

        if (existing) {
            if (existing.role !== 'admin') {
                await existing.update({ role: 'admin' });
                console.log(`Promoted existing user ${ADMIN_EMAIL} to admin.`);
            } else {
                console.log(`Admin user ${ADMIN_EMAIL} already exists.`);
            }
            process.exit(0);
        }

        const salt = await bcrypt.genSalt(10);
        const passwordHash = await bcrypt.hash(ADMIN_PASSWORD, salt);

        await User.create({
            name: ADMIN_NAME,
            email: ADMIN_EMAIL,
            passwordHash,
            role: 'admin',
            isVerified: true 
        });

        console.log(`Admin user created: ${ADMIN_EMAIL} / ${ADMIN_PASSWORD}`);
        process.exit(0);
    } catch (error) {
        console.error('Failed to seed admin:', error);
        process.exit(1);
    }
}

seedAdmin();
