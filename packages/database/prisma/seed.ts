import { PrismaClient, User } from '@prisma/client';
import { faker } from '@faker-js/faker';
import * as bcrypt from 'bcrypt';
import { PrismaPg } from '@prisma/adapter-pg';
import pg from 'pg';
import { YAML } from 'bun';
import * as path from 'path';

/**
 * if
 */
if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL environment variable is not set');
}

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);

const prisma = new PrismaClient({
  adapter,
  log: ['error', 'warn'],
});

/**
 * main
 */
async function main() {
  console.log('Start seeding...');

  await prisma.contact.deleteMany();
  await prisma.user.deleteMany();
  console.log('Cleared existing data.');

  const usersToCreate = 10;
  const usersForYaml: { email: string; password: string; role: string }[] = [];
  const clearTextPassword = 'password123';
  const hashedPassword = await bcrypt.hash(clearTextPassword, 10);

  /**
   * for
   */
  for (let i = 0; i < usersToCreate; i++) {
    const firstName = faker.person.firstName();
    const lastName = faker.person.lastName();
    const email = faker.internet.email({ firstName, lastName }).toLowerCase();
    const role = i === 0 ? 'ADMIN' : 'USER';

    const user = await prisma.user.create({
      data: {
        email,
        firstName,
        lastName,
        password: hashedPassword,
        emailVerified: faker.datatype.boolean(),
        role: role,
        isPremium: faker.datatype.boolean(),
      },
    });
    usersForYaml.push({ email: user.email, password: clearTextPassword, role: role });
    console.log(`Created user with id: ${user.id} and email: ${user.email} with role ${user.role}`);
  }

  const contactsToCreate = 5;
  /**
   * for
   */
  for (let i = 0; i < contactsToCreate; i++) {
    const firstName = faker.person.firstName();
    const lastName = faker.person.lastName();
    const email = faker.internet.email({ firstName, lastName }).toLowerCase();

    const contact = await prisma.contact.create({
      data: {
        email,
        firstName,
        lastName,
      },
    });
    console.log(`Created contact with id: ${contact.id} and email: ${contact.email}`);
  }

  const yamlFilePath = path.join(__dirname, 'user_logins.yml');
  try {
    const yamlContent = YAML.stringify({ users: usersForYaml }, null, 2);
    await Bun.write(yamlFilePath, yamlContent);
    console.log(`User logins written to ${yamlFilePath}`);
  } catch (e) {
    console.error(`Failed to write YAML file: ${e}`);
  }

  console.log('Seeding finished.');
}

/**
 * main
 */
main()
  .catch(async (e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
