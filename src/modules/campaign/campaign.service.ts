import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
} from '@nestjs/common';

import { UserEntity } from '@src/entity/user.entity';
import { CreateVisitingCampaignRequestDto } from '@src/modules/campaign/dto/create-visiting-campaign-request.dto';
import { PrismaService } from '@src/modules/prisma/prisma.service';
import { CampaignType } from '@src/common/constants/enum';
import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { ConfigService } from '@nestjs/config';
import { CreateWritingCampaignRequestDto } from '@src/modules/campaign/dto/create-writing-campaign-request.dto';

@Injectable()
export class CampaignService {
  private readonly s3Client = new S3Client({
    region: this.configService.getOrThrow('S3_REGION'),
    credentials: {
      accessKeyId: this.configService.getOrThrow('S3_ACCESS_KEY'),
      secretAccessKey: this.configService.getOrThrow('S3_SECRET_ACCESS_KEY'),
    },
  });

  private readonly bucketName = this.configService.getOrThrow('S3_BUCKET');

  constructor(
    private readonly prismaService: PrismaService,
    private readonly configService: ConfigService,
  ) {}

  /**
   * 랜덤한 파일명을 생성하는 메서드
   * @return 랜덤한 문자열을 반환합니다.
   */
  generateRandomFileName() {
    return Math.random().toString(36).substring(2, 12);
  }

  /**
   * 광고주 고유 번호와 파일명을 조합하여 S3 파일의 URL을 생성하는 메서드
   * @param advertiserNo
   * @param imageFileName
   * @return S3 파일의 URL을 리턴합니다.
   */
  generateS3FileUrl(advertiserNo: number, imageFileName: string): string {
    return `https://${this.bucketName}.s3.ap-northeast-2.amazonaws.com/${
      advertiserNo + imageFileName
    }.jpeg`;
  }

  /**
   * 모집 채널과 모집 조건을 입력받아 모집 고유 코드를 조회하는 메서드
   * @param channel 모집 채널
   * @param recruitmentCondition 모집 조건
   * @return 모집 고유 코드를 반환합니다.
   */
  async getChannelConditionCode(
    channel: number,
    recruitmentCondition: number,
  ): Promise<number> {
    const channelConditionCode =
      await this.prismaService.campaignChannelCondition.findFirst({
        select: {
          id: true,
        },
        where: {
          channel,
          recruitmentCondition,
        },
      });

    if (!channelConditionCode) {
      throw new BadRequestException('채널과 모집조건이 유효하지 않습니다.');
    }

    return channelConditionCode.id;
  }

  /**
   * 브랜드가 존재하는지 확인하는 메서드
   * @param brandId 브랜드 고유 번호
   * @param advertiser 광고주 정보
   * @return void
   */
  async verifyBrandExists(
    brandId: number,
    advertiser: UserEntity,
  ): Promise<void> {
    const existingBrand = await this.prismaService.brand.findUnique({
      select: {
        id: true,
      },
      where: {
        id: brandId,
        advertiserNo: advertiser.no,
      },
    });

    if (!existingBrand) {
      throw new BadRequestException('존재하지 않는 브랜드입니다.');
    }

    return;
  }

  /**
   * 옵션 배열 내의 각 객체에 campaign 고유 번호를 추가하고, 옵션 DB에 insert 하는 메서드
   * @param options 옵션 배열
   * @param campaign 캠페인 객체
   */
  async changeDataFormatOfOptionAndInsert(options, campaign) {
    const formattedOptionArr = options.map((obj) => {
      const valueString = JSON.stringify(obj.value);

      return { name: obj.name, value: valueString, campaignId: campaign.id };
    });

    await this.prismaService.campaignOption.createMany({
      data: formattedOptionArr,
    });

    return;
  }

  /**
   * base64 로 인코딩 된 이미지를 Buffer 객체로 디코딩하는 메서드
   * @param base64Image
   * @return Buffer 객체를 반환합니다.
   */
  decodeBase64ImageToBuffer(base64Image: string): Buffer {
    return Buffer.from(
      base64Image.replace(/^data:image\/\w+;base64,/, ''),
      'base64',
    );
  }

  /**
   * S3에 이미지를 업로드하는 메서드
   * @param fileName 파일명
   * @param imageBuffer 이미지 Buffer 객체
   * @return void
   * @exception
   */
  async uploadImageToS3(fileName: string, imageBuffer: Buffer): Promise<void> {
    try {
      await this.s3Client.send(
        new PutObjectCommand({
          Bucket: this.bucketName,
          Key: `${fileName}.jpeg`,
          Body: imageBuffer,
          ContentEncoding: 'base64',
          ContentType: 'image/jpeg',
        }),
      );

      return;
    } catch (err) {
      throw new InternalServerErrorException(
        'S3에 파일 업로드를 실패하였습니다.',
      );
    }
  }

  async createVisitingCampaign(
    advertiser: UserEntity,
    createVisitingCampaignRequestDto: CreateVisitingCampaignRequestDto,
  ): Promise<void> {
    const {
      brandId,
      channel,
      recruitmentCondition,
      recruitmentStartsDate,
      recruitmentEndsDate,
      selectionEndsDate,
      submitStartsDate,
      submitEndsDate,
      visitingAddr,
      visitingTime,
      note,
      visitingEndsDate,
      servicePrice,
      hashtag,
      options,
      thumbnail,
      images,
      ...rest
    } = createVisitingCampaignRequestDto;

    const channelConditionId = await this.getChannelConditionCode(
      channel,
      recruitmentCondition,
    );

    await this.verifyBrandExists(brandId, advertiser);

    /*
     * 캠페인 기본정보와, 방문형 캠페인 추가정보를 DB에 insert 합니다.
     */
    const campaign = await this.prismaService.campaign.create({
      data: {
        brandId,
        advertiserNo: advertiser.no,
        channelConditionId,
        type: CampaignType.VISITING,
        recruitmentStartsDate: new Date(recruitmentStartsDate),
        recruitmentEndsDate: new Date(recruitmentEndsDate),
        selectionEndsDate: new Date(selectionEndsDate),
        submitStartsDate: new Date(submitStartsDate),
        submitEndsDate: new Date(submitEndsDate),
        hashtag: JSON.stringify(hashtag),
        ...rest,
        campaignVisitingInfo: {
          create: {
            visitingAddr,
            visitingTime,
            note,
            visitingEndsDate: new Date(visitingEndsDate),
            servicePrice,
          },
        },
      },
    });

    if (options) {
      await this.changeDataFormatOfOptionAndInsert(options, campaign);
    }

    const thumbnailFileName = advertiser.no + this.generateRandomFileName();
    const thumbnailBuffer = this.decodeBase64ImageToBuffer(thumbnail);

    await this.uploadImageToS3(thumbnailFileName, thumbnailBuffer);

    /*
     * S3에 저장된 이미지 파일들의 객체 url 을 DB에 저장합니다.
     */
    await this.prismaService.campaignThumbnail.create({
      data: {
        campaignId: campaign.id,
        fileUrl: this.generateS3FileUrl(advertiser.no, thumbnailFileName),
      },
    });

    if (images && images.length > 0) {
      const detailedImageFileNamesArr = Array(images.length)
        .fill('')
        .map(() => advertiser.no + this.generateRandomFileName());
      const detailedImagesForDBInsertion: {
        campaignId: number;
        fileUrl: string;
      }[] = [];
      const bufferedDetailedImagesArr: Buffer[] = [];

      images.forEach((detailedImage, index) => {
        /*
         * images 배열의 모든 원소를 디코딩 하여 bufferedDetailedImagesArr 배열에 push 합니다.
         */
        const imageBuffer = this.decodeBase64ImageToBuffer(detailedImage);

        bufferedDetailedImagesArr.push(imageBuffer);

        /*
         * prisma createMany의 data 절에서 사용하기 위한 detailedImagesForInsertion 배열에 키 값이 campaignId, fileUrl 인 객체를 push 합니다.
         */

        detailedImagesForDBInsertion.push({
          campaignId: campaign.id,
          fileUrl: this.generateS3FileUrl(
            advertiser.no,
            detailedImageFileNamesArr[index],
          ),
        });
      }); // end of forEach

      bufferedDetailedImagesArr.map(async (bufferedImage, index) => {
        await this.uploadImageToS3(
          detailedImageFileNamesArr[index],
          bufferedImage,
        );
      });

      await this.prismaService.campaignImage.createMany({
        data: detailedImagesForDBInsertion,
      });
    } // end of if
  }
}
