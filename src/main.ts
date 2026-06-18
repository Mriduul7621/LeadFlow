import { prisma } from './db'

async function main() {
  console.log('🚀 Performing CRUD operations...')

  // CREATE
  const newUser = await prisma.user.create({
    data: { name: 'Alice', email: `alice-${Date.now()}@example.com` },
  })
  console.log('✅ CREATE: New user created:', newUser)

  // READ
  const foundUser = await prisma.user.findUnique({ where: { id: newUser.id } })
  console.log('✅ READ: Found user:', foundUser)

  // UPDATE
  const updatedUser = await prisma.user.update({
    where: { id: newUser.id },
    data: { name: 'Alice Smith' },
  })
  console.log('✅ UPDATE: User updated:', updatedUser)

  // DELETE
  await prisma.user.delete({ where: { id: newUser.id } })
  console.log('✅ DELETE: User deleted.')

  console.log('\n🎉 CRUD operations completed successfully!')
}

main()
  .catch((error) => {
    console.error('❌ Error:', error)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
