import {
  Body,
  Controller,
  Get,
  Post,
  Request,
  UseGuards,
} from '@nestjs/common';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { JwtAuthGuard } from './jwt-auth.guard';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('register')
  register(@Body() registerDto: RegisterDto) {
    return this.authService.register(registerDto.email, registerDto.password);
  }

  @Post('login')
  login(@Body() loginDto: LoginDto) {
    return this.authService.login(loginDto.email, loginDto.password);
  }

  /**
   * Guard-verification endpoint only, so JwtAuthGuard has a concrete route to
   * be e2e-tested against in this Story. Not meant to be built out further.
   */
  @UseGuards(JwtAuthGuard)
  @Get('me')
  getMe(@Request() request: { user: { userId: string; role: string } }) {
    return request.user;
  }
}
