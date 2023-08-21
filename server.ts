import express from 'express'
import { createServer } from 'http'
import { Server } from 'socket.io'
import { config } from 'dotenv'
import cors from 'cors'

if (process.env.NODE_ENV === 'development') config()

const PORT = process.env.PORT || 3000
const app = express()

app.use(cors())
const server = createServer(app)
const io = new Server(server)

type Box = {
  index: number
  value: null | 'X' | 'O'
}

const board: Box[] = [
  {
    index: 1,
    value: null,
  },
  {
    index: 2,
    value: null,
  },
  {
    index: 3,
    value: null,
  },
  {
    index: 4,
    value: null,
  },
  {
    index: 5,
    value: null,
  },
  {
    index: 6,
    value: null,
  },
  {
    index: 7,
    value: null,
  },
  {
    index: 8,
    value: null,
  },
  {
    index: 9,
    value: null,
  },
]

// types
type joinGameProps = {
  roomId: string
  email: string
  name: string
  photo: string
}

type roomTypes = {
  roomId: string
  users: {
    name: string
    photo: string
    isX: boolean
    id: string
    isReady: boolean
  }[]
  gameBoard: Box[]
  winingIndexes: number[][]
}

let allRooms: roomTypes[] = []

type createRoomUserPropTypes = {
  name: string
  photo: string
  id: string
}

function generateWiningIndexes(columns: number) {
  const winingIndexes: number[][] = []
  for (let i = 0; i < columns; i++) {
    const rowWinningIndex: number[] = []
    const colWinningIndex: number[] = []

    const boardIndexes = board.map((box) => box.index - 1)

    // For columns
    for (let j = 0; j < Math.pow(columns, 2); j++) {
      if (boardIndexes[i + j] % columns === i) {
        colWinningIndex.push(boardIndexes[i + j])
      }
    }
    winingIndexes.push(colWinningIndex)

    // For Rows
    for (let k = 0; k < columns; k++) {
      rowWinningIndex.push(columns * i + k)
    }
    winingIndexes.push(rowWinningIndex)
  }

  // For Diagonals

  const diagonalsIndex_1: number[] = []
  for (let m = 0; m < columns; m++) {
    diagonalsIndex_1.push(columns * m + m)
  }
  winingIndexes.push(diagonalsIndex_1)

  const diagonalsIndex_2: number[] = []
  for (let n = 1; n <= columns; n++) {
    diagonalsIndex_2.push(columns * n - n)
  }
  winingIndexes.push(diagonalsIndex_2)

  console.log(winingIndexes)
  return winingIndexes
}

const getRoomWithRoomId = (roomId: string) =>
  allRooms.find((room) => room.roomId === roomId)

function createNewRoomOrJoin(roomId: string, user: createRoomUserPropTypes) {
  // check if room already exist
  const room = getRoomWithRoomId(roomId)
  if (room) {
    room.users.push({
      name: user.name,
      photo: user.photo,
      isX: !room.users[0].isX,
      id: user.id,
      isReady: true,
    })
  } else {
    const winingIndexes = generateWiningIndexes(3)
    // create new room if not
    allRooms.push({
      roomId,
      users: [
        {
          id: user.id,
          name: user.name,
          photo: user.photo,
          isX: Math.random() >= 0.5,
          isReady: true,
        },
      ],
      gameBoard: JSON.parse(JSON.stringify(board)),
      winingIndexes,
    })
  }
}

type User = {
  name: string
  photo: string
  isX: boolean
}

function getNoOfPlayers(roomId: string): number {
  const room = getRoomWithRoomId(roomId)
  if (!room) return 0
  return room.users.length
}

function getPlayersInRoom(roomId: string): User[] {
  const room = getRoomWithRoomId(roomId)
  if (!room) return []
  return room.users
}

function checkWhoWins(room: roomTypes, isX: boolean): [number[], boolean] {
  const insertedIndexesByCurrentUser = room.gameBoard
    .filter((box) => box.value === (isX ? 'X' : 'O'))
    .map((box) => box.index - 1)

  const finalWiningIndexes = room.winingIndexes.filter((indexes) => {
    return indexes.every((index) =>
      insertedIndexesByCurrentUser.includes(index)
    )
  })
  return [finalWiningIndexes[0], isX]
}

// Socket IO Thing
io.on('connection', (socket) => {
  console.log('Device connected')

  socket.on('joinGame', ({ roomId, email, name, photo }: joinGameProps) => {
    // join the room
    socket.join(roomId)

    const noOfPlayers = getNoOfPlayers(roomId)
    if (noOfPlayers === 2) return
    if (noOfPlayers === 0) {
      io.to(roomId).emit('turn', 'WAIT')
    }

    // user joined message to the room
    io.to(roomId).emit('userJoined', {
      user: {
        email,
        photo,
        name,
      },
      message: `${name} joined the room`,
    })
    createNewRoomOrJoin(roomId, { name, photo, id: socket.id })

    if (getNoOfPlayers(roomId) === 2) {
      io.to(roomId).emit('allPlayerReady', 'Ready')
      const playerOneGetsFirstMove = Math.random() > 5
      const room = getRoomWithRoomId(roomId)
      io.to(roomId).emit('updateBoard', room?.gameBoard)

      if (playerOneGetsFirstMove) {
        io.to(roomId).emit('turn', room?.users[0].id)
      } else {
        io.to(roomId).emit('turn', room?.users[1].id)
      }
    }

    const players = getPlayersInRoom(roomId)
    io.to(roomId).emit('players', players)
  })

  socket.on('checkIfRoomExist', (roomId: string) => {
    console.log(roomId)

    const room = getRoomWithRoomId(roomId)
    console.log(room)

    if (!room) {
      socket.emit('checkIfRoomExistResponse', {
        isSuccess: false,
      })
    } else {
      socket.emit('checkIfRoomExistResponse', {
        isSuccess: true,
      })
    }
  })

  socket.on('restartGame', (roomId: string) => {
    const room = getRoomWithRoomId(roomId)
    if (!room) return
    room.gameBoard = JSON.parse(JSON.stringify(board))
    const requestedUser = room.users.find((user) => user.id === socket.id)
    if (!requestedUser) return
    requestedUser.isReady = true
    if (!room.users.every((user) => user.isReady)) return

    io.to(roomId).emit('restarted', room.gameBoard)
    const playerOneGetsFirstMove = Math.random() > 5
    if (playerOneGetsFirstMove) {
      io.to(roomId).emit('turn', room?.users[0].id)
    } else {
      io.to(roomId).emit('turn', room?.users[1].id)
    }
  })

  socket.on(
    'drawOnBoard',
    ({
      roomId,
      index,
      value,
    }: {
      roomId: string
      index: number
      value: null | 'X' | 'O'
    }) => {
      const room = getRoomWithRoomId(roomId)
      if (!room) return
      const toUpdate = room.gameBoard.find((box) => box.index === index)
      if (!toUpdate) return
      if (toUpdate.value) return
      toUpdate.value = value
      io.to(roomId).emit('receivingDraw', room.gameBoard)

      // Check who wins
      const [winningIdxs, isX] = checkWhoWins(room, value === 'X')

      // If there is winner
      if (winningIdxs) {
        const currentUser = room.users.find((user) => user.isX === isX)
        room.users.forEach((user) => {
          user.isReady = false
        })
        io.to(roomId).emit('winner', {
          winner: currentUser?.id,
          indexes: winningIdxs,
        })
        io.emit('turn', 'STOP')
      } else if (room.gameBoard.every((box) => box.value !== null)) {
        room.users.forEach((user) => {
          user.isReady = false
        })
        // draw
        io.emit('endgame', 'DRAW')
        io.emit('turn', 'STOP')
      } else {
        // continue
        const currentTurnIndex = room.users.findIndex((user) => {
          const val = user.isX ? 'X' : 'O'
          if (val === value) return true
          return false
        })

        const nextTurnSocketId = currentTurnIndex === 0 ? 1 : 0

        io.to(roomId).emit('turn', room.users[nextTurnSocketId].id)
      }
    }
  )

  socket.on('leaveRoom', (roomId: string) => {
    socket.leave(roomId)

    const room = getRoomWithRoomId(roomId)
    if (!room) return
    const noOfPlayers = getNoOfPlayers(roomId)
    if (noOfPlayers === 1) {
      const updatedRoom = allRooms.filter(
        (currentRoom) => JSON.stringify(currentRoom) !== JSON.stringify(room)
      )
      allRooms = updatedRoom
      console.log(allRooms)
    } else {
      const newAllRooms = allRooms.map((currentRoom) => {
        if (currentRoom.roomId === roomId) {
          return {
            ...currentRoom,
            users: currentRoom.users.filter((user) => user.id !== socket.id),
          }
        }
        return currentRoom
      })

      allRooms = [...newAllRooms]
      const room = allRooms.find((room) => room.roomId === roomId)
      if (!room) return
      io.to(roomId).emit('players', room.users)
      io.to(roomId).emit('playerLeft', `${socket.id} left`)
    }

    console.log(allRooms)
  })

  socket.on('disconnect', () => {
    console.log('Disconnected')

    console.log(socket.id)
  })
})

server.listen(PORT, () => console.log(`Server started: ${PORT}`))
